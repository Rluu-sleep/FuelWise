// Address -> NSW coordinate via OpenRouteService geocoding (PRODUCT_BRIEF §8.3).
// One ORS key serves both geocoding and routing. Validates the result is in NSW
// and rejects otherwise (ported intent from find_fuel.py's state check).

import { UpstreamError } from './http.js';
import type { Suggestion } from './types.js';

export interface GeoResult {
  lat: number;
  lon: number;
  displayName: string;
}

const ORS_GEOCODE_URL = 'https://api.openrouteservice.org/geocode/search';
const ORS_REVERSE_URL = 'https://api.openrouteservice.org/geocode/reverse';
const ORS_AUTOCOMPLETE_URL = 'https://api.openrouteservice.org/geocode/autocomplete';
// Bias toward Sydney / NSW so bare suburb names resolve well.
const NSW_FOCUS = { lat: -33.8688, lon: 151.2093 };

const NSW_NAMES = new Set(['new south wales', 'nsw']);

// Approximate NSW bounding box — used to validate raw coordinates (e.g. from
// browser geolocation) without a round-trip to the geocoder.
const NSW_BBOX = { minLat: -37.6, maxLat: -28.0, minLon: 140.9, maxLon: 153.7 };

export function isInNsw(lat: number, lon: number): boolean {
  return (
    lat >= NSW_BBOX.minLat &&
    lat <= NSW_BBOX.maxLat &&
    lon >= NSW_BBOX.minLon &&
    lon <= NSW_BBOX.maxLon
  );
}

/** Reverse-geocode coordinates to a friendly label (suburb). Best-effort: never
 *  throws — falls back to a generic label so a flaky geocoder can't block a
 *  geolocation search. */
export async function reverseGeocode(lat: number, lon: number, orsKey: string): Promise<string> {
  try {
    const params = new URLSearchParams({
      api_key: orsKey,
      'point.lon': String(lon),
      'point.lat': String(lat),
      'boundary.country': 'AU',
      size: '1',
    });
    const res = await fetch(`${ORS_REVERSE_URL}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return 'Your current location';
    const data: any = await res.json();
    return data?.features?.[0]?.properties?.label ?? 'Your current location';
  } catch {
    return 'Your current location';
  }
}

export async function geocode(address: string, orsKey: string): Promise<GeoResult> {
  const text = /nsw|new south wales/i.test(address)
    ? address.trim()
    : `${address.trim()}, NSW, Australia`;

  const params = new URLSearchParams({
    api_key: orsKey,
    text,
    'boundary.country': 'AU',
    'focus.point.lon': String(NSW_FOCUS.lon),
    'focus.point.lat': String(NSW_FOCUS.lat),
    size: '1',
  });

  let data: any;
  try {
    const res = await fetch(`${ORS_GEOCODE_URL}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new UpstreamError(`Geocoding service returned ${res.status}.`, res.status);
    }
    data = await res.json();
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError('Could not reach the geocoding service.');
  }

  const feature = data?.features?.[0];
  if (!feature) {
    throw new UpstreamError(
      `Couldn't find "${address}" in NSW. Try a suburb + "NSW", or a full street address.`,
      404,
    );
  }

  const props = feature.properties ?? {};
  const region: string = (props.region ?? '').toString().toLowerCase();
  // ORS sets `region` to the state for AU results. Reject anything not in NSW.
  if (region && !NSW_NAMES.has(region)) {
    throw new UpstreamError(
      `That address is in ${props.region}, not NSW. FuelWise only covers New South Wales.`,
      422,
    );
  }

  const [lon, lat] = feature.geometry?.coordinates ?? [];
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    throw new UpstreamError(`Couldn't resolve coordinates for "${address}".`, 404);
  }

  return { lat, lon, displayName: props.label ?? address };
}

/** Address type-ahead suggestions, biased + bounded to NSW. Returns up to 6. */
export async function autocomplete(text: string, orsKey: string): Promise<Suggestion[]> {
  const params = new URLSearchParams({
    api_key: orsKey,
    text,
    'boundary.country': 'AU',
    'boundary.rect.min_lon': String(NSW_BBOX.minLon),
    'boundary.rect.min_lat': String(NSW_BBOX.minLat),
    'boundary.rect.max_lon': String(NSW_BBOX.maxLon),
    'boundary.rect.max_lat': String(NSW_BBOX.maxLat),
    'focus.point.lon': String(NSW_FOCUS.lon),
    'focus.point.lat': String(NSW_FOCUS.lat),
    size: '6',
  });

  const res = await fetch(`${ORS_AUTOCOMPLETE_URL}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new UpstreamError(`Autocomplete returned ${res.status}.`, res.status);
  const data: any = await res.json();

  const out: Suggestion[] = [];
  for (const f of data?.features ?? []) {
    const region = (f.properties?.region ?? '').toString().toLowerCase();
    if (region && !NSW_NAMES.has(region)) continue; // NSW only
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (typeof lat === 'number' && typeof lon === 'number') {
      out.push({ label: f.properties?.label ?? text, lat, lon });
    }
  }
  return out;
}
