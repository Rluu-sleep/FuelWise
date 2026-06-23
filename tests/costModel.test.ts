import { describe, it, expect } from 'vitest';
import {
  analyseStations,
  computeStation,
  type FillSpec,
  type RawStation,
} from '../api/_lib/costModel';

const station = (over: Partial<RawStation>): RawStation => ({
  code: 'x',
  brand: 'Test',
  name: 'Test Station',
  address: '1 Test St',
  lat: -33.86,
  lon: 151.04,
  priceCents: 170,
  lastUpdatedRaw: null,
  ...over,
});

const litreFill = (litres: number): FillSpec => ({ mode: 'litres', litres, dollars: null });
const dollarFill = (dollars: number): FillSpec => ({ mode: 'dollars', litres: null, dollars });

describe('cost model — litre mode (PRODUCT_BRIEF §6.4 worked example)', () => {
  it('matches the brief: Station A vs B, 50L U91 sedan (8.0 L/100km)', () => {
    const a = computeStation(
      station({ code: 'A', priceCents: 179.9 }),
      0.8,
      false,
      litreFill(50),
      8.0,
    );
    const b = computeStation(
      station({ code: 'B', priceCents: 176.9 }),
      6.0,
      false,
      litreFill(50),
      8.0,
    );

    expect(a.fillCostAud).toBeCloseTo(89.95, 2);
    expect(a.burnedCostAud).toBeCloseTo(0.23, 2);
    expect(a.totalCostAud).toBeCloseTo(90.18, 2);
    expect(a.effectiveCpl).toBeCloseTo(180.4, 1);

    expect(b.fillCostAud).toBeCloseTo(88.45, 2);
    expect(b.burnedCostAud).toBeCloseTo(1.7, 2);
    expect(b.totalCostAud).toBeCloseTo(90.15, 2);
    expect(b.effectiveCpl).toBeCloseTo(180.3, 1);

    // True cost: B edges A even though the sticker gap looked like 3 c/L.
    expect(b.totalCostAud).toBeLessThan(a.totalCostAud);
  });
});

describe('cost model — the reveal: headline-cheapest is NOT best value', () => {
  it('a closer, slightly dearer station beats the cheapest sticker on true cost', () => {
    const raws = [
      station({ code: 'far', priceCents: 170.0, lat: -33.95, lon: 151.04 }), // cheapest sticker
      station({ code: 'near', priceCents: 172.0, lat: -33.861, lon: 151.041 }),
    ];
    // far ~10km, near ~0.5km (use explicit distances rather than geo)
    const { stations, recommendation } = analyseStations(
      raws,
      [10, 0.5],
      [false, false],
      litreFill(50),
      8.0,
    );

    expect(stations[0].code).toBe('near'); // best by true total cost
    expect(recommendation.stationCode).toBe('near');
    expect(recommendation.bestIsHeadlineCheapest).toBe(false);
    // saving vs the next-cheapest (far) is positive in both c/L and dollars
    expect(recommendation.vsNextCheapest?.cplSaved).toBeGreaterThan(0);
    expect(recommendation.vsNextCheapest?.dollarsSaved).toBeGreaterThan(0);
  });
});

describe('cost model — dollar-splash mode (§6.3)', () => {
  it('ranks by net litres delivered, not sticker price', () => {
    const raws = [
      station({ code: 'X', priceCents: 170 }),
      station({ code: 'Y', priceCents: 168 }), // cheaper sticker but further
    ];
    const { stations, recommendation } = analyseStations(
      raws,
      [1, 8],
      [false, false],
      dollarFill(50),
      8.0,
    );

    expect(stations[0].code).toBe('X'); // more fuel actually in the tank
    expect(stations[0].netLitres!).toBeGreaterThan(stations[1].netLitres!);
    expect(recommendation.bestIsHeadlineCheapest).toBe(false);
    expect(stations[0].totalCostAud).toBeCloseTo(50, 2); // spend is fixed
  });

  it('flags a station where the splash does not cover the drive (net_litres <= 0)', () => {
    const good = station({ code: 'close', priceCents: 180 });
    const bad = station({ code: 'miles-away', priceCents: 180, lat: -34.2, lon: 151.5 });
    const { stations } = analyseStations(
      [good, bad],
      [1, 30],
      [false, false],
      dollarFill(5),
      11.0,
    );

    const flagged = stations.find((s) => s.code === 'miles-away')!;
    expect(flagged.notWorthTheTrip).toBe(true);
    expect(flagged.netLitres!).toBeLessThanOrEqual(0);
    // a not-worth-it station never ranks first when a viable one exists
    expect(stations[0].code).toBe('close');
    expect(stations[stations.length - 1].code).toBe('miles-away');
  });
});

describe('cost model — price age flags', () => {
  it('classifies fresh / stale / old correctly', () => {
    const now = new Date('2026-06-23T12:00:00Z');
    const fmt = (d: Date) => {
      const p = (n: number) => String(n).padStart(2, '0');
      return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
    };
    const ago = (h: number) => fmt(new Date(now.getTime() - h * 3_600_000));

    const fresh = computeStation(station({ lastUpdatedRaw: ago(2) }), 1, false, litreFill(50), 8, now);
    const stale = computeStation(station({ lastUpdatedRaw: ago(30) }), 1, false, litreFill(50), 8, now);
    const old = computeStation(station({ lastUpdatedRaw: ago(24 * 9) }), 1, false, litreFill(50), 8, now);

    expect(fresh.priceAge).toBe('fresh');
    expect(fresh.priceIsStale).toBe(false);
    expect(stale.priceAge).toBe('stale');
    expect(stale.priceIsStale).toBe(true);
    expect(old.priceAge).toBe('old');
  });
});
