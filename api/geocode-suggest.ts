// GET /api/geocode-suggest?q=<text> — address type-ahead for the location field.
// Thin wrapper over ORS autocomplete (NSW-bounded). Fails soft: any upstream
// hiccup returns an empty list rather than an error, so type-ahead never blocks
// the user. Served by Vercel in prod and the dev-api plugin locally.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { autocomplete } from './_lib/geocode';

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
