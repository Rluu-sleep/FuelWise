// NSW FuelCheck — OAuth token + nearby prices (PRODUCT_BRIEF §8.2).
// Ported from find_fuel.py's get_fuelcheck_token + fuelcheck_nearby.

import { UpstreamError } from './http';
import type { FuelType } from './types';
import type { RawStation } from './costModel';

const TOKEN_URL =
  'https://api.onegov.nsw.gov.au/oauth/client_credential/accesstoken?grant_type=client_credentials';
const NEARBY_URL = 'https://api.onegov.nsw.gov.au/FuelCheckApp/v1/fuel/prices/nearby';

export const INITIAL_RADIUS_KM = 5;
export const EXPANDED_RADIUS_KM = 10;
export const MIN_STATIONS = 4;

/** FuelCheck wants 'dd/MM/yyyy hh:mm:ss AM/PM'. */
function requestTimestamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  let h = now.getUTCHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return (
    `${p(now.getUTCDate())}/${p(now.getUTCMonth() + 1)}/${now.getUTCFullYear()} ` +
    `${p(h)}:${p(now.getUTCMinutes())}:${p(now.getUTCSeconds())} ${ampm}`
  );
}

export async function getToken(clientId: string, clientSecret: string): Promise<string> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  let data: any;
  try {
    const res = await fetch(TOKEN_URL, { headers: { Authorization: `Basic ${basic}` } });
    if (!res.ok) {
      throw new UpstreamError(`FuelCheck auth failed (${res.status}).`, 502);
    }
    data = await res.json();
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError('Could not authenticate with FuelCheck.');
  }
  if (!data?.access_token) {
    throw new UpstreamError('FuelCheck did not return an access token.');
  }
  return data.access_token as string;
}

async function nearby(
  token: string,
  apiKey: string,
  lat: number,
  lon: number,
  fuelType: FuelType,
  radiusKm: number,
): Promise<RawStation[]> {
  let data: any;
  try {
    const res = await fetch(NEARBY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
        apikey: apiKey,
        transactionid: crypto.randomUUID(),
        requesttimestamp: requestTimestamp(),
      },
      body: JSON.stringify({
        fueltype: fuelType,
        namedlocation: `${lon},${lat}`,
        latitude: String(lat),
        longitude: String(lon),
        radius: String(radiusKm),
        sortby: 'Price',
        sortascending: 'true',
        brand: [],
      }),
    });
    if (!res.ok) {
      throw new UpstreamError(`FuelCheck prices lookup failed (${res.status}).`, 502);
    }
    data = await res.json();
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError('Could not fetch fuel prices from FuelCheck.');
  }

  const stationsByCode = new Map<string, any>();
  for (const s of data?.stations ?? []) stationsByCode.set(s.code, s);

  const out: RawStation[] = [];
  for (const price of data?.prices ?? []) {
    const station = stationsByCode.get(price.stationcode);
    if (!station) continue;
    const loc = station.location ?? {};
    const sLat = loc.latitude != null ? Number(loc.latitude) : null;
    const sLon = loc.longitude != null ? Number(loc.longitude) : null;
    if (sLat == null || sLon == null || Number.isNaN(sLat) || Number.isNaN(sLon)) {
      continue; // can't route to a station with no coordinates
    }
    out.push({
      code: String(station.code),
      brand: (station.brand ?? '').trim(),
      name: (station.name ?? '').trim(),
      address: (station.address ?? '').trim(),
      lat: sLat,
      lon: sLon,
      priceCents: Number(price.price),
      lastUpdatedRaw: price.lastupdated ?? null,
    });
  }
  return out;
}

/** Query nearby; auto-expand 5km -> 10km if fewer than MIN_STATIONS found. */
export async function findNearbyStations(
  token: string,
  apiKey: string,
  lat: number,
  lon: number,
  fuelType: FuelType,
): Promise<{ stations: RawStation[]; radiusKm: number }> {
  let radiusKm = INITIAL_RADIUS_KM;
  let stations = await nearby(token, apiKey, lat, lon, fuelType, radiusKm);
  if (stations.length < MIN_STATIONS) {
    radiusKm = EXPANDED_RADIUS_KM;
    stations = await nearby(token, apiKey, lat, lon, fuelType, radiusKm);
  }
  return { stations, radiusKm };
}
