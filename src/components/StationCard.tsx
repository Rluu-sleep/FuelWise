import { useEffect, useRef } from 'react';
import type { FillMode, Station } from '../lib/types';
import { aud, cpl, km, litres } from '../lib/format';

interface Props {
  station: Station;
  rank: number;
  isBest: boolean;
  isSelected: boolean;
  fillMode: FillMode;
  onSelect: (code: string) => void;
}

const ageClass = (age: Station['priceAge']): string =>
  age === 'old' ? 'text-error' : age === 'stale' ? 'text-warning' : 'text-muted-soft';

export default function StationCard({
  station,
  rank,
  isBest,
  isSelected,
  fillMode,
  onSelect,
}: Props) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isSelected) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isSelected]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(station.code)}
      className={
        'w-full text-left rounded-lg border p-4 transition-all ' +
        (isBest
          ? 'border-accent bg-white ring-2 ring-accent/70 '
          : 'border-hairline bg-white hover:border-muted-soft ') +
        (isSelected && !isBest ? 'ring-2 ring-ochre ' : '')
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={
            'shrink-0 grid place-items-center w-7 h-7 rounded-full text-sm font-semibold ' +
            (isBest ? 'bg-accent text-white' : 'bg-surface-card text-ink')
          }
        >
          {rank}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink truncate">{station.brand}</span>
            {isBest && (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-white bg-accent rounded-full px-2 py-0.5">
                Best value
              </span>
            )}
          </div>
          <div className="text-sm text-body truncate">{station.name}</div>
          <div className="text-xs text-muted break-words">{station.address}</div>

          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <div className="display nums text-2xl text-ink leading-none">
                {station.priceCents.toFixed(1)}
                <span className="text-sm text-muted font-normal"> c/L</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs whitespace-nowrap">
                <span className="text-muted">
                  {km(station.oneWayKm)}
                  {station.distanceIsEstimate && (
                    <span className="ml-1 rounded-sm bg-surface-strong px-1 text-[10px] text-body">
                      est.
                    </span>
                  )}
                </span>
                <span className={ageClass(station.priceAge)}>· {station.lastUpdatedLabel}</span>
              </div>
            </div>

            <div className="text-right">
              {fillMode === 'dollars' ? (
                station.notWorthTheTrip ? (
                  <div className="text-error text-sm font-semibold">Not worth the trip</div>
                ) : (
                  <>
                    <div className="display nums text-lg text-accent leading-none">
                      {litres(station.netLitres ?? 0)}
                    </div>
                    <div className="text-[11px] text-muted">in the tank</div>
                    <div className="text-xs text-body nums mt-1">{cpl(station.effectiveCpl)} eff.</div>
                  </>
                )
              ) : (
                <>
                  <div className="display nums text-lg text-accent leading-none">
                    {aud(station.totalCostAud)}
                  </div>
                  <div className="text-[11px] text-muted">True Total</div>
                  <div className="text-[11px] text-muted-soft nums leading-tight">
                    <div>{aud(station.fillCostAud)} fuel +</div>
                    <div>{aud(station.burnedCostAud)} drive</div>
                  </div>
                  <div className="text-xs text-body nums mt-1">{cpl(station.effectiveCpl)} eff.</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
