import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import type { FindFuelSuccess } from '../lib/types';

interface Props {
  token: string | undefined;
  /** The single pink origin dot — moves live as the user picks a location. */
  origin: { lat: number; lon: number } | null;
  result: FindFuelSuccess | null;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

const SYDNEY: [number, number] = [151.2093, -33.8688];

export default function MapView({ token, origin, result, selectedCode, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const markersRef = useRef<Map<string, { marker: mapboxgl.Marker; el: HTMLElement }>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Init map once.
  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: SYDNEY,
      zoom: 10,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      originMarkerRef.current = null;
    };
  }, [token]);

  // The single pink origin dot. Created once, then just repositioned so it
  // moves as the user picks a suggestion / uses their location.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!origin) {
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      return;
    }

    if (!originMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'fw-marker fw-marker--origin';
      el.title = 'Your location';
      originMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([origin.lon, origin.lat]).addTo(map);
    } else {
      originMarkerRef.current.setLngLat([origin.lon, origin.lat]);
    }

    // Recenter on the dot only when there are no station results framing the view.
    if (!result) {
      map.flyTo({ center: [origin.lon, origin.lat], zoom: 13, duration: 600 });
    }
  }, [origin, result]);

  // Station markers (numbered by rank) + fit bounds, on each result.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current.clear();
    if (!result) return;

    const { origin: searched } = result.query;
    const bestCode = result.recommendation.stationCode;
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([searched.lon, searched.lat]);

    result.stations.forEach((s, i) => {
      const el = document.createElement('div');
      const isBest = s.code === bestCode;
      el.className = 'fw-marker' + (isBest ? ' fw-marker--best' : '');
      el.textContent = String(i + 1);
      el.title = `${s.brand} — ${s.priceCents.toFixed(1)} c/L`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectRef.current(s.code);
      });
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map);
      markersRef.current.set(s.code, { marker, el });
      bounds.extend([s.lon, s.lat]);
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 64, maxZoom: 14, duration: 600 });
    }
  }, [result]);

  // Reflect selection on the station markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !result) return;
    markersRef.current.forEach(({ el }, code) => {
      el.classList.toggle('fw-marker--selected', code === selectedCode);
    });
    const sel = result.stations.find((s) => s.code === selectedCode);
    if (sel) {
      map.easeTo({ center: [sel.lon, sel.lat], duration: 400 });
    }
  }, [selectedCode, result]);

  if (!token) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-surface-soft p-8 text-center">
        <div className="max-w-sm">
          <div className="display text-lg text-ink">Map needs a Mapbox token</div>
          <p className="text-sm text-muted mt-2">
            Add <code className="bg-surface-card px-1 rounded-sm">VITE_MAPBOX_TOKEN</code> to{' '}
            <code className="bg-surface-card px-1 rounded-sm">.env.local</code> and restart the dev
            server. The ranked results still work without it.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="absolute inset-0" />;
}
