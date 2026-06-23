// The cost model — the heart of FuelWise (PRODUCT_BRIEF §6).
// Pure, no network: takes raw stations + driving distances + the fill spec and
// returns enriched, ranked stations plus the recommendation. Single source of
// truth, unit-tested in tests/costModel.test.ts. Ported from find_fuel.py.

import type { FillMode, Recommendation, SavingsVs, Station } from './types';

export interface RawStation {
  code: string;
  brand: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  priceCents: number;
  /** FuelCheck 'dd/MM/yyyy HH:mm:ss', or null. */
  lastUpdatedRaw: string | null;
}

export interface FillSpec {
  mode: FillMode;
  /** Litres to put in the tank (litres + full_tank modes). */
  litres: number | null;
  /** Dollars to spend at the pump (dollars mode). */
  dollars: number | null;
}

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

// --- Timestamp handling (port of parse_price_timestamp + age_label) ---------

/** FuelCheck returns timestamps like '03/06/2026 14:22:18' (UTC). */
export function parsePriceTimestamp(raw: string | null): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    const [, dd, mm, yyyy, hh, min, ss] = m;
    return new Date(
      Date.UTC(+yyyy, +mm - 1, +dd, +hh, +min, +ss),
    );
  }
  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

export function ageLabel(ts: Date | null, now: Date = new Date()): string {
  if (!ts) return 'unknown age';
  const ms = now.getTime() - ts.getTime();
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(0, Math.round(ms / 60_000))} min ago`;
  if (hours < 48) return `${hours.toFixed(1)} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function classifyAge(ts: Date | null, now: Date): Station['priceAge'] {
  if (!ts) return 'unknown';
  const hours = (now.getTime() - ts.getTime()) / 3_600_000;
  if (hours > 24 * 7) return 'old';
  if (hours > 24) return 'stale';
  return 'fresh';
}

// --- Per-station cost computation -------------------------------------------

export function computeStation(
  raw: RawStation,
  oneWayKm: number,
  distanceIsEstimate: boolean,
  fill: FillSpec,
  consumption: number,
  now: Date = new Date(),
): Station {
  const price = raw.priceCents / 100; // dollars per litre
  const roundtripKm = 2 * oneWayKm;
  const burnedLitres = (roundtripKm * consumption) / 100;
  const burnedCost = burnedLitres * price; // burn valued at THIS station's price

  let fillCost: number;
  let totalCost: number;
  let effectiveCpl: number;
  let netLitres: number | null = null;
  let notWorthTheTrip = false;

  if (fill.mode === 'dollars') {
    const dollars = fill.dollars ?? 0;
    const litresBought = dollars / price;
    netLitres = litresBought - burnedLitres;
    fillCost = dollars; // spend is fixed
    totalCost = dollars;
    if (netLitres > 0) {
      effectiveCpl = (dollars / netLitres) * 100; // cost per usable litre
    } else {
      effectiveCpl = Infinity;
      notWorthTheTrip = true;
    }
  } else {
    const litres = fill.litres ?? 0;
    fillCost = litres * price;
    totalCost = fillCost + burnedCost;
    effectiveCpl = litres > 0 ? (totalCost / litres) * 100 : Infinity;
  }

  const ts = parsePriceTimestamp(raw.lastUpdatedRaw);
  const priceAge = classifyAge(ts, now);

  return {
    code: raw.code,
    brand: raw.brand,
    name: raw.name,
    address: raw.address,
    lat: raw.lat,
    lon: raw.lon,
    priceCents: round(raw.priceCents, 1),
    oneWayKm: round(oneWayKm, 2),
    distanceIsEstimate,
    fillCostAud: round(fillCost, 2),
    burnedCostAud: round(burnedCost, 2),
    totalCostAud: round(totalCost, 2),
    effectiveCpl: Number.isFinite(effectiveCpl) ? round(effectiveCpl, 2) : Infinity,
    netLitres: netLitres === null ? null : round(netLitres, 2),
    notWorthTheTrip,
    lastUpdatedIso: ts ? ts.toISOString() : null,
    lastUpdatedLabel: ageLabel(ts, now),
    priceIsStale: priceAge === 'stale' || priceAge === 'old',
    priceAge,
  };
}

// --- Ranking & recommendation ----------------------------------------------

/** Litres that actually end up usable — drives the dollar-saving conversion. */
function usableLitres(s: Station, mode: FillMode, fill: FillSpec): number {
  if (mode === 'dollars') return s.netLitres ?? 0;
  return fill.litres ?? 0;
}

/** Rank ascending by "goodness": true total cost (litre modes) or effective
 *  cost-per-usable-litre (dollar mode). notWorthTheTrip stations sink to the end. */
export function rankStations(stations: Station[], mode: FillMode): Station[] {
  const ranked = [...stations];
  ranked.sort((a, b) => {
    if (a.notWorthTheTrip !== b.notWorthTheTrip) {
      return a.notWorthTheTrip ? 1 : -1;
    }
    if (mode === 'dollars') return a.effectiveCpl - b.effectiveCpl; // == net litres desc
    return a.totalCostAud - b.totalCostAud;
  });
  return ranked;
}

function savings(best: Station, other: Station, bestUsable: number): SavingsVs {
  const cplSaved = round(other.effectiveCpl - best.effectiveCpl, 2);
  // cents/L saved × usable litres = dollars saved — consistent across both modes.
  const dollarsSaved = round(((other.effectiveCpl - best.effectiveCpl) / 100) * bestUsable, 2);
  return { stationCode: other.code, cplSaved, dollarsSaved };
}

export function buildRecommendation(
  ranked: Station[],
  mode: FillMode,
  fill: FillSpec,
): Recommendation {
  const best = ranked[0];
  const bestUsable = usableLitres(best, mode, fill);

  const nextCheapest = ranked[1] ?? null;
  const nearest = ranked.reduce(
    (acc, s) => (acc === null || s.oneWayKm < acc.oneWayKm ? s : acc),
    null as Station | null,
  );

  const cheapestSticker = ranked.reduce((acc, s) =>
    s.priceCents < acc.priceCents ? s : acc,
  );

  return {
    stationCode: best.code,
    vsNextCheapest: nextCheapest ? savings(best, nextCheapest, bestUsable) : null,
    vsNearest:
      nearest && nearest.code !== best.code ? savings(best, nearest, bestUsable) : null,
    bestIsHeadlineCheapest: Math.abs(best.priceCents - cheapestSticker.priceCents) < 0.001,
  };
}

/** Convenience: compute + rank + recommend in one call. */
export function analyseStations(
  raws: RawStation[],
  distancesKm: number[],
  fallbacks: boolean[],
  fill: FillSpec,
  consumption: number,
  now: Date = new Date(),
): { stations: Station[]; recommendation: Recommendation } {
  const computed = raws.map((raw, i) =>
    computeStation(raw, distancesKm[i], fallbacks[i], fill, consumption, now),
  );
  const stations = rankStations(computed, fill.mode);
  const recommendation = buildRecommendation(stations, fill.mode, fill);
  return { stations, recommendation };
}
