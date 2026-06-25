import * as XLSX from 'xlsx';
import type { FindFuelSuccess, QuerySummary, Station } from './types';

// Excel-friendly numbers (kept numeric so the cells stay sortable/analysable).
const round1 = (n: number): number => Number(n.toFixed(1));
const round2 = (n: number): number => Number(n.toFixed(2));

function fillSummary(q: QuerySummary): string {
  if (q.fillMode === 'dollars') return `$${q.dollarsToSpend ?? 0} spend`;
  return `${q.litresToFill ?? 0} L`;
}

const HEADERS = [
  'Value Rank',
  'Station',
  'Address',
  'Price (c/L)',
  'Distance (km)',
  'Last Updated',
  'Fuel ($)',
  'Drive ($)',
  'True Total ($)',
  'Net Litres',
  'Effective (c/L)',
];

type Row = (string | number)[];

function stationRow(s: Station, valueRank: number): Row {
  return [
    valueRank,
    s.name || s.brand,
    s.address,
    round1(s.priceCents),
    round2(s.oneWayKm),
    s.lastUpdatedLabel,
    round2(s.fillCostAud),
    round2(s.burnedCostAud),
    round2(s.totalCostAud),
    s.netLitres == null ? '' : round2(s.netLitres),
    Number.isFinite(s.effectiveCpl) ? round1(s.effectiveCpl) : '',
  ];
}

function buildSheet(title: string, q: QuerySummary, rows: { s: Station; rank: number }[]): XLSX.WorkSheet {
  const aoa: Row[] = [
    [title],
    [`Location: ${q.resolvedTo}`],
    [`Fuel: ${q.fuelType}    Fill: ${fillSummary(q)}    Consumption: ${q.consumption} L/100km`],
    [`Generated: ${new Date().toLocaleString('en-AU')}`],
    [],
    HEADERS,
    ...rows.map(({ s, rank }) => stationRow(s, rank)),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 10 }, { wch: 28 }, { wch: 36 }, { wch: 11 }, { wch: 13 }, { wch: 14 },
    { wch: 9 }, { wch: 9 }, { wch: 13 }, { wch: 11 }, { wch: 14 },
  ];
  return ws;
}

/**
 * Export a petrol data-analysis workbook for the current results: the top 3
 * best-value stations and the 3 closest stations to the searched location.
 */
export function exportAnalysis(result: FindFuelSuccess): void {
  const { stations, query } = result;

  // `stations` is already ranked by true value, so the first three are the best.
  const bestValue = stations.slice(0, 3).map((s, i) => ({ s, rank: i + 1 }));

  // 3 closest by driving distance — keep each one's overall value rank for context.
  const valueRank = new Map(stations.map((s, i) => [s.code, i + 1]));
  const closest = [...stations]
    .sort((a, b) => a.oneWayKm - b.oneWayKm)
    .slice(0, 3)
    .map((s) => ({ s, rank: valueRank.get(s.code) ?? 0 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet('Top 3 Best Value', query, bestValue), 'Best Value');
  XLSX.utils.book_append_sheet(wb, buildSheet('3 Closest Stations', query, closest), 'Closest');

  const place = query.resolvedTo.split(',')[0].replace(/[^\w]+/g, '-') || 'NSW';
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `FuelWise-${place}-${stamp}.xlsx`);
}
