// POST /api/find-fuel — the one-pass endpoint (PRODUCT_BRIEF §9).
// geocode -> FuelCheck prices -> ORS matrix -> cost model -> ranked JSON.
// Written in Vercel's Node handler style; also served locally by the dev-api
// plugin in vite.config.ts (no Vercel CLI needed for local development).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { UpstreamError } from './_lib/http';
import { geocode, isInNsw, reverseGeocode } from './_lib/geocode';
import {
  EXPANDED_RADIUS_KM,
  findNearbyStations,
  getToken,
} from './_lib/fuelcheck';
import { drivingDistancesKm } from './_lib/routing';
import { analyseStations, type FillSpec } from './_lib/costModel';
import type {
  FillMode,
  FindFuelRequest,
  FindFuelResponse,
  FuelType,
} from './_lib/types';

const VALID_FUEL: ReadonlySet<string> = new Set(['E10', 'U91', 'P95', 'P98']);
const VALID_MODE: ReadonlySet<string> = new Set(['full_tank', 'litres', 'dollars']);

type NodeReq = IncomingMessage & { body?: unknown };

function sendJson(res: ServerResponse, status: number, payload: FindFuelResponse): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readBody(req: NodeReq): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel pre-parsed
  if (typeof req.body === 'string' && req.body) return JSON.parse(req.body);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

function parseOrigin(o: any): { lat: number; lon: number } | null {
  if (!o || typeof o !== 'object') return null;
  const lat = Number(o.lat);
  const lon = Number(o.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function validate(b: any): FindFuelRequest {
  if (!b || typeof b !== 'object') throw new UpstreamError('Invalid request body.', 400);
  const address = typeof b.address === 'string' ? b.address.trim() : '';
  const origin = parseOrigin(b.origin);
  // Either a typed address or explicit coordinates (geolocation) is required.
  if (!origin && !address) {
    throw new UpstreamError('Enter a NSW address or use your current location.', 400);
  }
  if (origin && !isInNsw(origin.lat, origin.lon)) {
    throw new UpstreamError(
      'Your location is outside NSW. FuelWise only covers New South Wales.',
      422,
    );
  }
  if (!VALID_FUEL.has(b.fuelType)) throw new UpstreamError('Invalid fuel type.', 400);
  if (!VALID_MODE.has(b.fillMode)) throw new UpstreamError('Invalid fill mode.', 400);
  const consumption = Number(b.consumption);
  if (!(consumption > 0)) throw new UpstreamError('Consumption must be greater than 0.', 400);
  const tank = Number(b.tank);
  if (!(tank > 0)) throw new UpstreamError('Tank size must be greater than 0.', 400);
  const fillValue = b.fillValue == null ? null : Number(b.fillValue);

  if (b.fillMode === 'litres' && !(Number(fillValue) > 0)) {
    throw new UpstreamError('Enter a litre amount greater than 0.', 400);
  }
  if (b.fillMode === 'dollars' && !(Number(fillValue) > 0)) {
    throw new UpstreamError('Enter a dollar amount greater than 0.', 400);
  }

  const originLabel = typeof b.originLabel === 'string' ? b.originLabel.trim() : null;

  return {
    address,
    origin,
    originLabel: originLabel || null,
    fuelType: b.fuelType as FuelType,
    fillMode: b.fillMode as FillMode,
    fillValue,
    consumption,
    tank,
  };
}

/** Resolve the fill spec (litres vs dollars) + the litres figure to report. */
function resolveFill(req: FindFuelRequest): { fill: FillSpec; litresToFill: number | null } {
  if (req.fillMode === 'dollars') {
    return { fill: { mode: 'dollars', litres: null, dollars: req.fillValue }, litresToFill: null };
  }
  const litres = req.fillMode === 'full_tank' ? req.fillValue ?? req.tank : req.fillValue!;
  return { fill: { mode: req.fillMode, litres, dollars: null }, litresToFill: litres };
}

export default async function handler(req: NodeReq, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const fuelKey = process.env.FUELCHECK_API_KEY;
  const fuelSecret = process.env.FUELCHECK_API_SECRET;
  const orsKey = process.env.ORS_API_KEY;
  if (!fuelKey || !fuelSecret || !orsKey) {
    return sendJson(res, 500, {
      ok: false,
      error: 'Server is missing API keys. Set FUELCHECK_API_KEY, FUELCHECK_API_SECRET and ORS_API_KEY in .env.local.',
    });
  }

  let request: FindFuelRequest;
  try {
    request = validate(await readBody(req));
  } catch (err) {
    const e = err instanceof UpstreamError ? err : new UpstreamError('Malformed request.', 400);
    return sendJson(res, e.status, { ok: false, error: e.message });
  }

  try {
    // 1. Resolve the origin: use geolocation coords directly (reverse-geocoded
    //    for a friendly label), otherwise geocode the typed address.
    const origin = request.origin
      ? {
          lat: request.origin.lat,
          lon: request.origin.lon,
          // Prefer the picked suggestion's label; only reverse-geocode (e.g. for
          // raw geolocation coords) when no label was supplied.
          displayName:
            request.originLabel ??
            (await reverseGeocode(request.origin.lat, request.origin.lon, orsKey)),
        }
      : await geocode(request.address, orsKey);

    // 2. FuelCheck token + nearby prices (auto-expand radius).
    const token = await getToken(fuelKey, fuelSecret);
    const { stations: raws, radiusKm } = await findNearbyStations(
      token,
      fuelKey,
      origin.lat,
      origin.lon,
      request.fuelType,
    );

    if (raws.length === 0) {
      return sendJson(res, 200, {
        ok: false,
        error: `No stations selling ${request.fuelType} found within ${EXPANDED_RADIUS_KM} km of ${origin.displayName}.`,
      });
    }

    // 3. Real driving distances (ORS matrix) with haversine fallback.
    const { distancesKm, fallbacks } = await drivingDistancesKm(
      origin.lat,
      origin.lon,
      raws,
      orsKey,
    );

    // 4. Cost model: enrich, rank, recommend.
    const { fill, litresToFill } = resolveFill(request);
    const { stations, recommendation } = analyseStations(
      raws,
      distancesKm,
      fallbacks,
      fill,
      request.consumption,
    );

    return sendJson(res, 200, {
      ok: true,
      query: {
        resolvedTo: origin.displayName,
        origin: { lat: origin.lat, lon: origin.lon },
        fuelType: request.fuelType,
        litresToFill,
        dollarsToSpend: request.fillMode === 'dollars' ? request.fillValue : null,
        fillMode: request.fillMode,
        consumption: request.consumption,
        searchRadiusKm: radiusKm,
      },
      stations,
      recommendation,
    });
  } catch (err) {
    if (err instanceof UpstreamError) {
      return sendJson(res, err.status, { ok: false, error: err.message });
    }
    // Never leak raw upstream errors or keys.
    return sendJson(res, 502, {
      ok: false,
      error: 'Something went wrong fetching fuel data. Please try again in a moment.',
    });
  }
}
