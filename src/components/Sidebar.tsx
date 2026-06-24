import { useState } from 'react';
import type { Inputs, Status } from '../App';
import type { FillMode, FindFuelSuccess } from '../lib/types';
import { FUEL_TYPES, VEHICLE_CATEGORIES } from '../lib/vehicles';
import AddressField from './AddressField';
import FuelNozzleIcon from './FuelNozzleIcon';
import SegmentedControl from './SegmentedControl';
import SavingsPanel from './SavingsPanel';
import StationCard from './StationCard';

interface Props {
  inputs: Inputs;
  status: Status;
  result: FindFuelSuccess | null;
  error: string | null;
  loadingStage: number;
  locating: boolean;
  selectedCode: string | null;
  onChange: (patch: Partial<Inputs>) => void;
  onSubmit: () => void;
  onSelect: (code: string) => void;
  onReset: () => void;
  onUseLocation: () => void;
}

const LOADING_STAGES = [
  'Geocoding your location…',
  'Fetching live NSW prices…',
  'Calculating driving distances…',
];

const FILL_MODES = [
  { id: 'full_tank', label: 'Full Tank' },
  { id: 'litres', label: 'Litres' },
  { id: 'dollars', label: 'Dollars' },
] as const;

export default function Sidebar(props: Props) {
  const { inputs, status, result, error, loadingStage, selectedCode } = props;
  const showResults = status === 'success' && result;

  const canSubmit =
    inputs.address.trim().length > 0 &&
    (inputs.fillMode === 'full_tank' || (inputs.fillValue ?? 0) > 0) &&
    status !== 'loading' &&
    !props.locating;

  return (
    <aside className="w-full md:w-[368px] md:h-full shrink-0 border-b md:border-b-0 md:border-r border-hairline bg-canvas flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <FuelNozzleIcon className="w-10 h-10 text-ink" />
          <span className="display text-lg">FuelWise</span>
        </div>
        <p className="text-sm text-muted mt-1.5">Save on fuel. With fuel.</p>
      </div>

      <div className="flex-1 overflow-y-auto fw-scroll px-5 pb-5">
        {showResults ? (
          <Results {...props} result={result!} selectedCode={selectedCode} />
        ) : (
          <Form {...props} canSubmit={canSubmit} loadingStage={loadingStage} error={error} status={status} />
        )}
      </div>
    </aside>
  );
}

// A custom cursor: a small pointer plus a "More Information" label rendered to
// the right of the hotspot, replacing the default help (?) cursor on the icon.
const INFO_CURSOR_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='20'>" +
  "<path d='M0 0 L0 15 L4 11 L7 17 L9 16 L6 10 L11 10 Z' fill='#1c3c36' stroke='#ffffff' stroke-width='1'/>" +
  "<text x='16' y='14' font-family='sans-serif' font-size='11' font-weight='400' fill='#1c3c36'>More Information</text>" +
  '</svg>';
const INFO_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(INFO_CURSOR_SVG)}") 0 0, pointer`;

/** Info icon + fuel-type descriptions. The popup shows only while the cursor is
 *  over the "i" icon (or it's keyboard-focused) and hides as soon as it leaves. */
function FuelTypesInfo() {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex -translate-y-0.5">
      <button
        type="button"
        aria-label="About the fuel types"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        style={{ cursor: INFO_CURSOR }}
        className="grid place-items-center w-3.5 h-3.5 rounded-full border border-muted-soft text-muted text-[9px] font-bold leading-none hover:border-ink hover:text-ink focus:outline-none focus:border-ink focus:text-ink"
      >
        i
      </button>
      {show && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-0 top-6 z-30 w-max max-w-[calc(100vw-2rem)] rounded-md border border-hairline bg-white p-3 shadow-lg"
        >
          <ul className="space-y-1.5 text-xs leading-snug text-body">
            {FUEL_TYPES.map((f) => (
              <li key={f.id} className="whitespace-nowrap">
                <span className="font-semibold text-ink">{f.label} ({f.tag})</span> — {f.desc}
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}

function Form({
  inputs,
  status,
  error,
  loadingStage,
  locating,
  canSubmit,
  onChange,
  onSubmit,
  onUseLocation,
}: Props & { canSubmit: boolean }) {
  const loading = status === 'loading';

  const onModeChange = (mode: FillMode) => onChange({ fillMode: mode, fillValue: null });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
      className="space-y-5"
    >
      {/* Address */}
      <div>
        <label className="block text-sm font-semibold text-ink mb-1.5">NSW Location</label>
        <AddressField
          value={inputs.address}
          disabled={loading}
          hasOrigin={inputs.origin !== null}
          locating={locating}
          onChange={(text) => onChange({ address: text, origin: null })}
          onSelect={(label, origin) => onChange({ address: label, origin })}
          onUseLocation={onUseLocation}
        />
      </div>

      {/* Fuel type */}
      <div>
        <div className="flex items-baseline gap-1.5 mb-1.5">
          <label className="text-sm font-semibold text-ink">Fuel Types</label>
          <FuelTypesInfo />
        </div>
        <SegmentedControl
          ariaLabel="Fuel type"
          options={FUEL_TYPES}
          value={inputs.fuelType}
          onChange={(id) => onChange({ fuelType: id })}
        />
      </div>

      {/* Vehicle */}
      <div>
        <label className="block text-sm font-semibold text-ink mb-1.5">Vehicle Types</label>
        <div className="grid grid-cols-2 gap-2">
          {VEHICLE_CATEGORIES.map((v) => {
            const active = v.id === inputs.vehicle.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onChange({ vehicle: v, fillValue: null })}
                className={
                  'text-left rounded-md border p-2.5 transition-colors ' +
                  (active
                    ? 'border-accent bg-white ring-1 ring-accent'
                    : 'border-hairline bg-white hover:border-muted-soft')
                }
              >
                <div className="text-sm font-semibold text-ink">{v.label}</div>
                <div className="text-[11px] text-muted">{v.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Fill mode */}
      <div>
        <label className="block text-sm font-semibold text-ink mb-1.5">How much?</label>
        <SegmentedControl
          ariaLabel="Fill amount mode"
          options={FILL_MODES}
          value={inputs.fillMode}
          onChange={onModeChange}
        />

        {inputs.fillMode === 'full_tank' && (
          <div className="mt-2">
            <span className="block text-xs text-muted mb-1">Litres (Approx. Default)</span>
            <div className="flex items-center h-11 rounded-md border border-hairline bg-canvas px-3 text-base text-ink nums">
              <span className="flex-1">{inputs.vehicle.tank}</span>
              <span className="text-muted ml-1">L</span>
            </div>
          </div>
        )}
        {inputs.fillMode === 'litres' && (
          <div className="mt-2">
            <NumberField
              label="Litres to fill"
              value={inputs.fillValue}
              placeholder="40"
              suffix="L"
              onChange={(n) => onChange({ fillValue: n })}
            />
          </div>
        )}
        {inputs.fillMode === 'dollars' && (
          <div className="mt-2">
            <NumberField
              label="Dollars to spend"
              value={inputs.fillValue}
              placeholder="50"
              prefix="$"
              onChange={(n) => onChange({ fillValue: n })}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-error/30 bg-error/5 text-error text-sm px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full h-11 rounded-md bg-accent text-white font-semibold text-sm transition-opacity disabled:bg-hairline disabled:text-muted-soft hover:opacity-90"
      >
        {loading ? LOADING_STAGES[Math.min(loadingStage, LOADING_STAGES.length - 1)] : 'Find best value'}
      </button>

      {loading && (
        <div className="flex gap-1.5 justify-center">
          {LOADING_STAGES.map((_, i) => (
            <span
              key={i}
              className={
                'h-1.5 rounded-full transition-all ' +
                (i <= loadingStage ? 'w-6 bg-accent' : 'w-3 bg-hairline')
              }
            />
          ))}
        </div>
      )}
    </form>
  );
}

function Results({
  result,
  selectedCode,
  onSelect,
  onReset,
}: Props & { result: FindFuelSuccess; selectedCode: string | null }) {
  const { stations, recommendation, query } = result;
  const fewerThanFour = stations.length < 4;

  return (
    <div className="space-y-4">
      {/* Pinned so the location summary + Edit stay reachable while the cards
          scroll underneath. */}
      <div className="sticky top-0 z-20 -mx-5 px-5 pt-1 pb-3 bg-canvas border-b border-hairline flex items-center justify-between">
        <div className="text-xs text-muted truncate pr-2" title={query.resolvedTo}>
          {stations.length} station{stations.length === 1 ? '' : 's'} near{' '}
          <span className="text-body">{query.resolvedTo}</span>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="shrink-0 text-sm font-semibold text-ink underline underline-offset-2"
        >
          Edit
        </button>
      </div>

      <SavingsPanel result={result} selectedCode={selectedCode} onSelect={onSelect} />

      {fewerThanFour && (
        <div className="rounded-md bg-surface-card text-body text-xs px-3 py-2">
          Only {stations.length} station{stations.length === 1 ? '' : 's'} sell {query.fuelType}{' '}
          within {query.searchRadiusKm} km — showing everything found.
        </div>
      )}

      <div className="space-y-2.5">
        {stations
          // The best-value station is shown only as the green panel above — keep
          // its overall rank number but omit its duplicate white card here.
          .map((s, i) => ({ s, rank: i + 1 }))
          .filter(({ s }) => s.code !== recommendation.stationCode)
          .map(({ s, rank }) => (
            <StationCard
              key={s.code}
              station={s}
              rank={rank}
              isBest={false}
              isSelected={s.code === selectedCode}
              fillMode={query.fillMode}
              onSelect={onSelect}
            />
          ))}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  placeholder,
  prefix,
  suffix,
  onChange,
}: {
  label: string;
  value: number | null;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  onChange: (n: number | null) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1">{label}</span>
      <div className="flex items-center h-11 rounded-md border border-hairline bg-white px-3 focus-within:border-ink">
        {prefix && <span className="text-muted mr-1">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? null : Number(v));
          }}
          className="w-full bg-transparent text-base text-ink placeholder:text-muted-soft focus:outline-none nums"
        />
        {suffix && <span className="text-muted ml-1">{suffix}</span>}
      </div>
    </label>
  );
}
