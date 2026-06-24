import type { FindFuelSuccess, Station } from '../lib/types';
import { aud, cpl, km, litres } from '../lib/format';

interface Props {
  result: FindFuelSuccess;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

function byCode(stations: Station[], code: string | undefined): Station | undefined {
  return code ? stations.find((s) => s.code === code) : undefined;
}

export default function SavingsPanel({ result, selectedCode, onSelect }: Props) {
  const { stations, recommendation, query } = result;
  const best = byCode(stations, recommendation.stationCode);
  if (!best) return null;

  // The best-value station's overall rank (its position in the ranked list) —
  // shown as a badge to match the numbered white cards below.
  const rank = stations.findIndex((s) => s.code === recommendation.stationCode) + 1;

  const isDollar = query.fillMode === 'dollars';
  const { vsNextCheapest, vsNearest } = recommendation;

  // The actual stations behind each comparison — so we can show their real
  // current price, distance and freshness (not just the saving vs them).
  const nextCheapestStation = byCode(stations, vsNextCheapest?.stationCode);
  const nearestStation = byCode(stations, vsNearest?.stationCode);

  const headline = isDollar
    ? `${litres(best.netLitres ?? 0)} actually in your tank for ${aud(query.dollarsToSpend ?? 0)}`
    : `${aud(best.totalCostAud)} to fill ${litres(query.litresToFill ?? 0)}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(best.code)}
      className={
        'block w-full text-left rounded-lg bg-accent text-white p-4 transition-all ' +
        (selectedCode === best.code ? 'ring-2 ring-orange-500 ' : '')
      }
    >
      <div className="flex items-start gap-3">
        <span className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-white text-accent text-sm font-semibold">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[1.5px] text-accent-soft">
            Best value
          </div>
          <h2 className="display text-xl mt-1 leading-tight">{best.name}</h2>
          <p className="text-sm text-white/80 mt-0.5">{best.address}</p>

          <div className="display-tight nums text-2xl mt-3">{headline}</div>

      {/* The whole point: best value counts the pump price AND the fuel burned
          driving there and back from the chosen origin. */}
      {isDollar ? (
        <div className="text-sm text-white/70 nums mt-1">
          net of the fuel burned on the {km(best.oneWayKm)} drive each way
        </div>
      ) : (
        <div className="text-sm text-white/70 nums mt-1">
          {aud(best.fillCostAud)} fuel + {aud(best.burnedCostAud)} drive
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 mt-4">
        <div className="rounded-md bg-white/10 p-3">
          <div className="text-[11px] text-accent-soft uppercase tracking-wide">
            Most current price
          </div>
          <div className="display nums text-lg mt-0.5">{cpl(best.priceCents)}</div>
          <div className="text-xs text-white/80 nums">
            {km(best.oneWayKm)} · {best.lastUpdatedLabel}
          </div>
        </div>
        {(vsNextCheapest || vsNearest) && (
          <>
            {vsNextCheapest && nextCheapestStation && (
            <div className="rounded-md bg-white/10 p-3">
              <div className="text-[11px] text-accent-soft uppercase tracking-wide">
                vs next-cheapest
              </div>
              <div className="display nums text-lg mt-0.5">{cpl(nextCheapestStation.priceCents)}</div>
              <div className="text-xs text-white/80 nums">
                {km(nextCheapestStation.oneWayKm)} · {nextCheapestStation.lastUpdatedLabel}
              </div>
              <div className="text-xs text-white/80 nums">{(nextCheapestStation.priceCents - best.priceCents).toFixed(1).padStart(5, '0')} c/L difference</div>
            </div>
          )}
          {vsNearest && nearestStation && (
            <div className="rounded-md bg-white/10 p-3">
              <div className="text-[11px] text-accent-soft uppercase tracking-wide">vs nearest</div>
              <div className="display nums text-lg mt-0.5">{cpl(nearestStation.priceCents)}</div>
              <div className="text-xs text-white/80 nums">
                {km(nearestStation.oneWayKm)} · {nearestStation.lastUpdatedLabel}
              </div>
              <div className="text-xs text-white/80 nums">{(nearestStation.priceCents - best.priceCents).toFixed(1).padStart(5, '0')} c/L difference</div>
            </div>
          )}
          </>
        )}
      </div>
        </div>
      </div>
    </button>
  );
}
