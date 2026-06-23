import { useCallback, useReducer, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import { findFuel } from './lib/api';
import type { FindFuelSuccess, FillMode, FuelType } from './lib/types';
import { VEHICLE_CATEGORIES, type VehicleCategory } from './lib/vehicles';

export interface Inputs {
  address: string;
  /** Exact coords from a picked autocomplete suggestion. Cleared when the user
   *  types again, so a stale pin can't outlive the text it came from. */
  origin: { lat: number; lon: number } | null;
  fuelType: FuelType;
  vehicle: VehicleCategory;
  fillMode: FillMode;
  /** litres (full_tank/litres) or dollars (dollars). null on full_tank => use tank. */
  fillValue: number | null;
}

export type Status = 'idle' | 'loading' | 'success' | 'error';

interface State {
  inputs: Inputs;
  status: Status;
  result: FindFuelSuccess | null;
  error: string | null;
  selectedCode: string | null;
}

type Action =
  | { type: 'setInputs'; patch: Partial<Inputs> }
  | { type: 'submit' }
  | { type: 'success'; result: FindFuelSuccess }
  | { type: 'error'; error: string }
  | { type: 'select'; code: string | null }
  | { type: 'reset' };

const initial: State = {
  inputs: {
    address: '',
    origin: null,
    fuelType: 'U91',
    vehicle: VEHICLE_CATEGORIES[1], // sedan
    fillMode: 'full_tank',
    fillValue: null,
  },
  status: 'idle',
  result: null,
  error: null,
  selectedCode: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'setInputs':
      return { ...state, inputs: { ...state.inputs, ...action.patch } };
    case 'submit':
      return { ...state, status: 'loading', error: null };
    case 'success':
      return {
        ...state,
        status: 'success',
        result: action.result,
        error: null,
        selectedCode: action.result.recommendation.stationCode,
      };
    case 'error':
      return { ...state, status: 'error', error: action.error, result: null };
    case 'select':
      return { ...state, selectedCode: action.code };
    case 'reset':
      return { ...state, status: 'idle', result: null, error: null, selectedCode: null };
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initial);
  const [loadingStage, setLoadingStage] = useState(0);
  const [locating, setLocating] = useState(false);
  const stageTimers = useRef<number[]>([]);

  const setInputs = useCallback((patch: Partial<Inputs>) => {
    dispatch({ type: 'setInputs', patch });
  }, []);

  const select = useCallback((code: string | null) => {
    dispatch({ type: 'select', code });
  }, []);

  const submit = useCallback(async () => {
    const { inputs } = state;
    if (!inputs.address.trim()) return;

    dispatch({ type: 'submit' });
    // Cosmetic staged loading copy (one network call under the hood).
    setLoadingStage(0);
    stageTimers.current.forEach(clearTimeout);
    stageTimers.current = [
      window.setTimeout(() => setLoadingStage(1), 700),
      window.setTimeout(() => setLoadingStage(2), 1800),
    ];

    const res = await findFuel({
      address: inputs.address.trim(),
      origin: inputs.origin, // exact coords from a picked suggestion, if any
      originLabel: inputs.origin ? inputs.address.trim() : null,
      fuelType: inputs.fuelType,
      fillMode: inputs.fillMode,
      fillValue: inputs.fillValue,
      consumption: inputs.vehicle.consumption,
      tank: inputs.vehicle.tank,
    });

    stageTimers.current.forEach(clearTimeout);
    if (res.ok) dispatch({ type: 'success', result: res });
    else dispatch({ type: 'error', error: res.error });
  }, [state]);

  const useMyLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      dispatch({ type: 'error', error: 'Your browser does not support location access.' });
      return;
    }
    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const origin = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        // Capture the location only: drop the pink dot and fill the field, but
        // DON'T search. The user reviews fuel / vehicle / amount options and
        // submits when ready.
        dispatch({ type: 'setInputs', patch: { origin, address: 'My current location' } });
        setLocating(false);
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow it in your browser, or type an address.'
            : 'Could not get your location. Try typing an address instead.';
        dispatch({ type: 'error', error: msg });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  // Single source of truth for the pink dot: a picked/located origin if we have
  // one, else the origin of the last search. One marker, moves with the input.
  const originPin = state.inputs.origin ?? state.result?.query.origin ?? null;

  return (
    <div className="h-full w-full flex flex-col md:flex-row bg-canvas">
      <Sidebar
        inputs={state.inputs}
        status={state.status}
        result={state.result}
        error={state.error}
        loadingStage={loadingStage}
        locating={locating}
        selectedCode={state.selectedCode}
        onChange={setInputs}
        onSubmit={submit}
        onSelect={select}
        onReset={reset}
        onUseLocation={useMyLocation}
      />
      <div className="flex-1 min-h-[42vh] md:min-h-0 relative">
        <MapView
          token={import.meta.env.VITE_MAPBOX_TOKEN as string | undefined}
          origin={originPin}
          result={state.result}
          selectedCode={state.selectedCode}
          onSelect={select}
        />
      </div>
    </div>
  );
}
