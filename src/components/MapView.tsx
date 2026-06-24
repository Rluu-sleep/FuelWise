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

// How many of the nearest stations get an auto price popup.
const PRICE_POPUP_COUNT = 3;
// Estimated rendered popup size (price + time line) used for collision scoring.
const POPUP_W = 86;
const POPUP_H = 46;

type PopupAnchor =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

// Compass bearing (0 = N, 90 = E) from the origin to a station.
function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const ANCHORS: PopupAnchor[] = [
  'bottom',
  'bottom-left',
  'left',
  'top-left',
  'top',
  'top-right',
  'right',
  'bottom-right',
];

// Compass direction (deg) the popup extends for each anchor — used to prefer
// placements that radiate away from the cluster.
const OUTWARD: Record<PopupAnchor, number> = {
  bottom: 0,
  'bottom-left': 45,
  left: 90,
  'top-left': 135,
  top: 180,
  'top-right': 225,
  right: 270,
  'bottom-right': 315,
};

const overlapArea = (a: Box, b: Box): number => {
  const x = Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l));
  const y = Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  return x * y;
};

const offscreenArea = (box: Box, w: number, h: number): number => {
  const total = (box.r - box.l) * (box.b - box.t);
  return total - overlapArea(box, { l: 0, t: 0, r: w, b: h });
};

const angleDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// The pixel box a popup would occupy for a given anchor + offset, given its
// marker's screen point. The popup extends opposite its anchor.
function popupBox(x: number, y: number, anchor: PopupAnchor, offset: number): Box {
  const dd = offset / Math.SQRT2;
  let l: number;
  let t: number;
  switch (anchor) {
    case 'bottom': l = x - POPUP_W / 2; t = y - offset - POPUP_H; break;
    case 'top': l = x - POPUP_W / 2; t = y + offset; break;
    case 'left': l = x + offset; t = y - POPUP_H / 2; break;
    case 'right': l = x - offset - POPUP_W; t = y - POPUP_H / 2; break;
    case 'bottom-left': l = x + dd; t = y - dd - POPUP_H; break;
    case 'bottom-right': l = x - dd - POPUP_W; t = y - dd - POPUP_H; break;
    case 'top-left': l = x + dd; t = y + dd; break;
    case 'top-right': l = x - dd - POPUP_W; t = y + dd; break;
    default: l = x - POPUP_W / 2; t = y - offset - POPUP_H;
  }
  return { l, t, r: l + POPUP_W, b: t + POPUP_H };
}

interface Placement {
  station: { lon: number; lat: number; priceCents: number; lastUpdatedLabel: string };
  anchor: PopupAnchor;
  offset: number;
}

// Greedily place each popup at the anchor/offset that least overlaps the markers
// (incl. the origin dot) and the already-placed popups, while preferring to
// radiate outward. Runs once the map is settled so projections are accurate.
function computePopupPlacements(
  map: mapboxgl.Map,
  stations: Placement['station'][],
  origin: { lat: number; lon: number },
  markers: Map<string, { el: HTMLElement }>,
  originMarker: mapboxgl.Marker | null,
): Placement[] {
  const cr = map.getContainer().getBoundingClientRect();
  const PAD = 4;
  const toLocal = (r: DOMRect): Box => ({
    l: r.left - cr.left - PAD,
    t: r.top - cr.top - PAD,
    r: r.right - cr.left + PAD,
    b: r.bottom - cr.top + PAD,
  });

  const occupied: Box[] = [];
  markers.forEach(({ el }) => occupied.push(toLocal(el.getBoundingClientRect())));
  if (originMarker) occupied.push(toLocal(originMarker.getElement().getBoundingClientRect()));

  const OFFSETS = [24, 44, 66];
  const placements: Placement[] = [];

  for (const s of stations) {
    const pt = map.project([s.lon, s.lat]);
    const b = bearing(origin.lat, origin.lon, s.lat, s.lon);
    let best: { anchor: PopupAnchor; offset: number; box: Box; score: number } | null = null;

    for (const offset of OFFSETS) {
      for (const anchor of ANCHORS) {
        const box = popupBox(pt.x, pt.y, anchor, offset);
        let overlap = 0;
        for (const o of occupied) overlap += overlapArea(box, o);
        const off = offscreenArea(box, cr.width, cr.height);
        // Collisions dominate; then prefer outward direction and a small offset.
        const score =
          (overlap + off) * 100 + (angleDiff(OUTWARD[anchor], b) / 180) * 30 + offset * 0.05;
        if (!best || score < best.score) best = { anchor, offset, box, score };
      }
    }

    if (best) {
      placements.push({ station: s, anchor: best.anchor, offset: best.offset });
      occupied.push(best.box);
    }
  }

  return placements;
}

export default function MapView({ token, origin, result, selectedCode, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const markersRef = useRef<Map<string, { marker: mapboxgl.Marker; el: HTMLElement }>>(new Map());
  const pricePopupsRef = useRef<mapboxgl.Popup[]>([]);
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
    pricePopupsRef.current.forEach((p) => p.remove());
    pricePopupsRef.current = [];
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

    // Auto price popups for the nearest few stations. Placed once the map has
    // settled (so marker projections are accurate) at the anchor/offset that
    // best avoids covering markers or the other popups.
    const nearest = [...result.stations]
      .sort((a, b) => a.oneWayKm - b.oneWayKm)
      .slice(0, PRICE_POPUP_COUNT);

    let done = false;
    const placePopups = () => {
      if (done) return;
      done = true;
      computePopupPlacements(map, nearest, searched, markersRef.current, originMarkerRef.current).forEach(
        ({ station, anchor, offset }) => {
          const popup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            focusAfterOpen: false,
            anchor,
            offset,
            className: 'fw-price-popup',
          })
            .setLngLat([station.lon, station.lat])
            .setHTML(
              `<div class="fw-price-popup__price">${station.priceCents.toFixed(1)} c/L</div>` +
                `<div class="fw-price-popup__time">${station.lastUpdatedLabel}</div>`,
            )
            .addTo(map);
          pricePopupsRef.current.push(popup);
        },
      );
    };

    map.once('idle', placePopups);
    const fallback = window.setTimeout(placePopups, 900);

    return () => {
      map.off('idle', placePopups);
      clearTimeout(fallback);
    };
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
