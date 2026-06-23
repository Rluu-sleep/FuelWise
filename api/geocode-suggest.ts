// GET /api/geocode-suggest — address helper for the location field.
//   ?q=<text>         -> type-ahead suggestions (ORS autocomplete, NSW-bounded).
//   ?lat=..&lon=..    -> reverse-geocode coords to a readable label (used by
//                        "Use my current location" to show the place name).
// Thin wrapper over ORS. Fails soft: any upstream hiccup returns an empty list /
// generic label rather than an error, so it never blocks the user. Served by
// Vercel in prod and the dev-api plugin locally.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { autocomplete, reverseGeocode } from './_lib/geocode.js';

function send(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const orsKey = process.env.ORS_API_KEY;
  if (!orsKey) {
    return send(res, 500, { ok: false, error: 'Server is missing ORS_API_KEY.' });
  }

  const url = new URL(req.url ?? '', 'http://localhost');

  // Reverse mode: coords -> readable label. reverseGeocode never throws.
  const latRaw = url.searchParams.get('lat');
  const lonRaw = url.searchParams.get('lon');
  if (latRaw !== null && lonRaw !== null) {
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return send(res, 200, { ok: true, label: 'Your current location' });
    }
    const label = await reverseGeocode(lat, lon, orsKey);
    return send(res, 200, { ok: true, label });
  }

  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 3) {
    return send(res, 200, { ok: true, suggestions: [] });
  }

  try {
    const suggestions = await autocomplete(q, orsKey);
    return send(res, 200, { ok: true, suggestions });
  } catch {
    // Fail soft — type-ahead should never surface an error to the user.
    return send(res, 200, { ok: true, suggestions: [] });
  }
}
