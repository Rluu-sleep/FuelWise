# FuelWise NSW

Find the *genuinely* cheapest petrol station near you in NSW — ranked by the **true total
cost to fill up**: the pump price *plus* the fuel you burn driving there and back. A sticker
price 3 c/L cheaper isn't a win if the station is 6 km out of your way, and this app does that
second-order maths for you.

- **Frontend:** Vite + React + TypeScript, Tailwind, Mapbox GL.
- **Backend:** one Vercel serverless function (`/api/find-fuel`) that geocodes the address
  (OpenRouteService), fetches live prices (NSW FuelCheck), computes real driving distances
  (ORS matrix), runs the cost model, and returns ranked stations.
- **Cost model** lives in one tested module: `api/_lib/costModel.ts`.

## Setup

1. **Install:** `npm install`
2. **Keys:** copy `.env.example` → `.env.local` and fill in real values:
   - `VITE_MAPBOX_TOKEN` — public Mapbox token (restrict it by URL in the Mapbox dashboard).
   - `FUELCHECK_API_KEY` / `FUELCHECK_API_SECRET` — from <https://api.nsw.gov.au> (Fuel API).
   - `ORS_API_KEY` — from <https://openrouteservice.org/dev> (serves geocoding *and* routing).

   The three server keys never reach the browser — only the `VITE_`-prefixed one is bundled.

## Run locally

```bash
npm run dev      # http://localhost:5173  (Vite + the /api function via a dev plugin)
```

No Vercel CLI or login is needed for local dev: `vite.config.ts` mounts the serverless
function at `/api/find-fuel` during development. The same `api/find-fuel.ts` deploys unchanged
to Vercel.

```bash
npm test         # cost-model unit tests (incl. the brief's §6.4 worked example)
npm run build    # typecheck + production build
```

## Deploy (later)

Push to a Vercel project; set the four env vars in **Project Settings → Environment Variables**.
`vercel.json` already configures the function. `npm run build` is the build command; output is `dist`.

## How the ranking works

- **Full tank / Litres:** rank by `total_cost = litres·price + roundtrip_km·consumption/100·price`
  (burned fuel valued at the destination station's own price). Lowest true total wins.
- **Dollars:** spend is fixed, so rank by **net litres actually delivered** after the drive.
  Stations where the splash doesn't even cover the round trip are flagged "not worth the trip".

See `PRODUCT_BRIEF.md` §6 for the full model and `DESIGN.md.md` for the visual system.
