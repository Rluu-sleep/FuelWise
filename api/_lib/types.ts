// Shared request/response shapes for POST /api/find-fuel (PRODUCT_BRIEF §9).
// Imported by both the serverless function and the React client.

export type FuelType = 'E10' | 'U91' | 'P95' | 'P98';
export type FillMode = 'full_tank' | 'litres' | 'dollars';

/** One address autocomplete suggestion (GET /api/geocode-suggest). */
export interface Suggestion {
  label: string;
  lat: number;
  lon: number;
}

export interface FindFuelRequest {
  address: string;
  /** Optional explicit origin (e.g. browser geolocation or a picked suggestion).
   *  When set, the server skips address geocoding and uses these coords directly. */
  origin?: { lat: number; lon: number } | null;
  /** Friendly label for an explicit origin (e.g. the chosen suggestion's text).
   *  When present, the server uses it instead of reverse-geocoding the coords. */
  originLabel?: string | null;
  fuelType: FuelType;
  fillMode: FillMode;
  /** litres or dollars when mode != full_tank; null => use tank default */
  fillValue: number | null;
  /** L/100km, from vehicle category or user override */
  consumption: number;
  /** L, category default — used when full_tank */
  tank: number;
}

export interface Station {
  code: string;
  brand: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  priceCents: number;
  oneWayKm: number;
  distanceIsEstimate: boolean;
  fillCostAud: number;
  burnedCostAud: number;
  totalCostAud: number;
  effectiveCpl: number;
  /** Only populated in dollar-splash mode; null otherwise. */
  netLitres: number | null;
  /** True in dollar mode when the splash doesn't even cover the round-trip burn. */
  notWorthTheTrip: boolean;
  lastUpdatedIso: string | null;
  lastUpdatedLabel: string;
  priceIsStale: boolean;
  /** 'fresh' | 'stale' (>24h) | 'old' (>7d) — drives the colour of the age label. */
  priceAge: 'fresh' | 'stale' | 'old' | 'unknown';
}

export interface SavingsVs {
  stationCode: string;
  cplSaved: number;
  dollarsSaved: number;
}

export interface Recommendation {
  stationCode: string;
  vsNextCheapest: SavingsVs | null;
  vsNearest: SavingsVs | null;
  bestIsHeadlineCheapest: boolean;
}

export interface QuerySummary {
  resolvedTo: string;
  origin: { lat: number; lon: number };
  fuelType: FuelType;
  litresToFill: number | null;
  dollarsToSpend: number | null;
  fillMode: FillMode;
  consumption: number;
  searchRadiusKm: number;
}

export interface FindFuelSuccess {
  ok: true;
  query: QuerySummary;
  stations: Station[];
  recommendation: Recommendation;
}

export interface FindFuelError {
  ok: false;
  error: string;
}

export type FindFuelResponse = FindFuelSuccess | FindFuelError;
