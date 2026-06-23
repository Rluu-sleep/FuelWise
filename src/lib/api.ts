import type { FindFuelRequest, FindFuelResponse, Suggestion } from './types';

/** Address type-ahead. Returns [] on empty/no match, or null if the request was
 *  aborted/failed (caller should ignore null and keep any prior suggestions). */
export async function geocodeSuggest(
  q: string,
  signal?: AbortSignal,
): Promise<Suggestion[] | null> {
  try {
    const res = await fetch(`/api/geocode-suggest?q=${encodeURIComponent(q)}`, { signal });
    const data = await res.json();
    return data?.ok ? (data.suggestions as Suggestion[]) : [];
  } catch {
    return null; // aborted or network error
  }
}

/** Reverse-geocode coords to a readable label for the location field. Best-effort:
 *  returns a generic fallback on any failure so it never blocks the user. */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(`/api/geocode-suggest?lat=${lat}&lon=${lon}`);
    const data = await res.json();
    return data?.ok && data.label ? (data.label as string) : 'Your current location';
  } catch {
    return 'Your current location';
  }
}

export async function findFuel(req: FindFuelRequest): Promise<FindFuelResponse> {
  let res: Response;
  try {
    res = await fetch('/api/find-fuel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    return { ok: false, error: 'Network error — check your connection and try again.' };
  }
  try {
    return (await res.json()) as FindFuelResponse;
  } catch {
    return { ok: false, error: `Unexpected server response (${res.status}).` };
  }
}
