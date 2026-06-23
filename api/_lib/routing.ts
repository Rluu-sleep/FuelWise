// Real driving distances via ORS matrix, with a haversine x 1.3 per-leg fallback
// (PRODUCT_BRIEF §8.3). Ported from find_fuel.py's driving_distances_km.

import { haversineKm } from './http.js';
import type { RawStation } from './costModel.js';

const ORS_MATRIX_URL = 'https://api.openrouteservice.org/v2/matrix/driving-car';
const STRAIGHT_LINE_MULTIPLIER = 1.3; // urban-driving heuristic

export interface DistanceResult {
  distancesKm: number[];
  fallbacks: boolean[];
}

export async function drivingDistancesKm(
  originLat: number,
  originLon: number,
  stations: RawStation[],
  orsKey: string,
): Promise<DistanceResult> {
  const n = stations.length;
  const distances: (number | null)[] = new Array(n).fill(null);
  const fallbacks: boolean[] = new Array(n).fill(false);

  const locations = [
    [originLon, originLat],
    ...stations.map((s) => [s.lon, s.lat]),
  ];

  try {
    const res = await fetch(ORS_MATRIX_URL, {
      method: 'POST',
      headers: {
        Authorization: orsKey,
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        locations,
        sources: [0],
        destinations: Array.from({ length: n }, (_, i) => i + 1),
        metrics: ['distance'],
        units: 'km',
      }),
    });
    if (res.ok) {
      const data: any = await res.json();
      const row: (number | null)[] = data?.distances?.[0] ?? [];
      for (let i = 0; i < n; i++) {
        if (typeof row[i] === 'number') distances[i] = row[i] as number;
      }
    }
  } catch {
    // whole call failed — every leg falls back below
  }

  // Fill any gaps (or the whole array) with haversine x 1.3, flagged as estimates.
  for (let i = 0; i < n; i++) {
    if (distances[i] === null) {
      const s = stations[i];
      distances[i] = haversineKm(originLat, originLon, s.lat, s.lon) * STRAIGHT_LINE_MULTIPLIER;
      fallbacks[i] = true;
    }
  }

  return { distancesKm: distances as number[], fallbacks };
}
