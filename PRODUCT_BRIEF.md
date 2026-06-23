# FuelWise NSW — Product & Build Brief

A build specification for Claude Code. The target deliverable is a deployed web app: **Vite + React frontend, Vercel serverless backend, Mapbox map.** This document is the source of truth for what to build and how the pieces fit together.

---

## 1. One-liner

A web app that helps NSW drivers find the *genuinely* best-value petrol station near them — ranking nearby stations by the **true total cost to fill up**, which is the pump price *plus* the cost of the fuel burned driving there and back. The cheapest sticker price is not always the best deal once you've driven 6 km out of your way; this app surfaces that.

---

## 2. Goals and non-goals

**Goals**

- Take a free-text NSW location, a fuel type, a vehicle category, and a fill amount, and return a ranked list of at least 4 nearby stations by true total fill-up cost.
- Show the results on a map that dominates the screen, with a left sidebar for inputs.
- Make the "best value" choice obvious, and quantify the saving against both the *next-cheapest* and the *nearest* station — in cents per litre and in dollars.
- Feel like a considered, interactive product. Clean, fast, legible. Not generic AI-template output.

**Non-goals (v1)**

- Diesel and LPG. NSW FuelCheck has the data, but the product scope is the four petrol grades only.
- Anywhere outside NSW.
- Turn-by-turn navigation. Show the address; let the user open their own map app.
- User accounts, saved vehicles, price history, or any persistence between sessions.

---

## 3. Target user and the core insight

A NSW driver about to fill up who wants the best deal and is willing to drive a *little* further for it — but not so far that the drive eats the saving. The product's whole reason to exist is the second-order calculation that drivers can't easily do in their heads: a station 4 km away at 3 c/L cheaper can lose to one 800 m away once you count the round-trip burn. Every design decision should protect the clarity of that insight.

---

## 4. User workflow

1. User enters their NSW address or suburb as free text (e.g. `"Lidcombe NSW"` or `"12 George St, Sydney"`).
2. User selects **one** fuel type: `E10`, `U91` (Unleaded 91), `P95` (Premium 95), `P98` (Premium 98).
3. User picks **one** vehicle category: small car / hatchback, sedan, SUV, large SUV / 4WD.
4. User specifies the fill amount, **one of**:
   - **Full tank** — uses the category's default tank size, with an option to override the litres.
   - **Custom litres** — an explicit litre amount.
   - **Dollar splash** — an explicit dollar amount to spend at the pump.
5. User submits. The app geocodes the location, fetches live nearby prices, computes real driving distances, runs the cost model, and ranks the stations.
6. The map shows the user's origin plus at least 4 station markers. The sidebar shows a ranked list of station cards. The best-value option is highlighted on both.
7. A savings panel states how much the best option saves versus the next-cheapest and versus the nearest station, in c/L and dollars.

---

## 5. Functional requirements

### 5.1 Inputs

| Input | Type | Rules |
|---|---|---|
| Location | free text | Required. Must geocode to a NSW coordinate or the app shows a clear error. |
| Fuel type | single select | One of `E10`, `U91`, `P95`, `P98`. |
| Vehicle category | single select | One of the four categories in §10. Sets default consumption and tank size. |
| Fill mode | single select | `full_tank` \| `litres` \| `dollars`. |
| Fill value | number | For `litres`: litres > 0. For `dollars`: AUD > 0. For `full_tank`: defaults to category tank, user-overridable. |

### 5.2 Output — per station (show at least 4; as many as exist within radius if fewer)

- Brand and station name
- Address
- Price per litre (cents), i.e. the headline / sticker price
- One-way driving distance in km — flagged if it's a straight-line estimate rather than real routing
- Price-reported timestamp, with an "X min/hours/days ago" label; flag prices older than 24 h, warn on older than 7 days
- **Calculated true total fill-up cost** (AUD) and **effective c/L**

### 5.3 Output — recommendation and savings

- Highlight the single best-value station (lowest true total cost; for dollar-splash mode, most litres actually delivered — see §6.3).
- Show savings vs the **next-cheapest by true total cost** and vs the **nearest station**, each expressed in both c/L-effective and total dollars.
- If the best-value station is also the headline-cheapest, say so plainly ("cheapest sticker price is also the best deal here — no trick").

---

## 6. The cost model (the heart of the app)

This is the differentiator. Implement it server-side and keep it exact.

### 6.1 Definitions

- `price` — station's pump price in **dollars per litre** (FuelCheck reports cents; divide by 100).
- `dist_km` — **one-way** driving distance from origin to station.
- `consumption` — vehicle fuel use in **L per 100 km**.
- `litres` — litres being put into the tank at the station.

### 6.2 Litre-based fills (`full_tank` and `litres` modes)

```
fill_cost      = litres * price
roundtrip_km   = 2 * dist_km
burned_litres  = roundtrip_km * consumption / 100
burned_cost    = burned_litres * price          // burn valued at THIS station's price
total_cost     = fill_cost + burned_cost
effective_cpl  = (total_cost / litres) * 100     // back to cents
```

The burned fuel is priced at the **destination station's own price** — it represents the cost of replacing the fuel you spent getting there. Rank stations by `total_cost` ascending.

### 6.3 Dollar-splash fills (`dollars` mode)

Here total spend at the pump is fixed, so what varies between stations is **how much fuel actually ends up in your tank** after the drive. Rank by net litres delivered, descending.

```
litres_bought = dollars / price
burned_litres = (2 * dist_km) * consumption / 100
net_litres    = litres_bought - burned_litres     // fuel that stays in the tank
effective_cpl = (dollars / net_litres) * 100       // cost per usable litre
```

Rank by `net_litres` descending (equivalently `effective_cpl` ascending). Surface `net_litres` in the UI for this mode so the comparison is legible. Guard against `net_litres <= 0` (station so far the splash doesn't even cover the drive) — flag it rather than dividing by zero.

### 6.4 Worked example (litre mode)

50 L of U91, sedan (8.0 L/100km).
- Station A: 179.9 c/L, 0.8 km away → fill $89.95 + burn (1.6 km × 8/100 × $1.799 = $0.23) = **$90.18**, effective 180.4 c/L.
- Station B: 176.9 c/L, 6.0 km away → fill $88.45 + burn (12 km × 8/100 × $1.769 = $1.70) = **$90.15**, effective 180.3 c/L.

Sticker price says B wins by 3 c/L. True cost says it's effectively a tie — and a third closer station could beat both. That reveal is the product.

---

## 7. System architecture

```
Browser (Vite + React SPA)
  │  Mapbox GL JS renders the map with the public Mapbox token
  │  POST /api/find-fuel  { address, fuelType, fillMode, fillValue, consumption, tank }
  ▼
Vercel Serverless Functions  (the /api directory — this is the backend)
  ├─ geocode    →  ORS / HeiGIT geocoding   (server holds ORS_API_KEY)
  ├─ prices     →  NSW FuelCheck OAuth + nearby prices  (server holds FuelCheck id/secret)
  ├─ routing    →  ORS matrix (driving-car)  (server holds ORS_API_KEY)
  └─ cost model →  rank stations, compute savings, return JSON
  ▼
Browser renders ranked station cards + map markers + savings panel
```

**Why a backend proxy and not a pure SPA:** the NSW FuelCheck OAuth client secret and the ORS key must never reach the browser. Vercel serverless functions are the natural fit — they ship in the same repo, deploy with the frontend, and keep secrets in server-side env vars. The Mapbox token is the one credential that *can* live in the client (it's a public, URL-restrictable token).

**Recommended shape:** a single primary endpoint `POST /api/find-fuel` that does geocode → prices → routing → cost math in one pass and returns ranked results. This mirrors a clean one-call-per-search design and keeps the client dumb. Optionally add `GET /api/geocode-suggest?q=` later for type-ahead on the address field.

---

## 8. External APIs

### 8.1 Mapbox (map display) — client-side

- Mapbox GL JS for the interactive map. User will provide the access token.
- Token goes in `VITE_MAPBOX_TOKEN` (public, exposed to client by design — restrict it by URL in the Mapbox dashboard).
- Used only for rendering tiles and markers. Do **not** use Mapbox for geocoding or routing here — those are ORS's job per the chosen stack.

### 8.2 NSW FuelCheck (live prices) — server-side, OAuth 2.0

- Register at <https://api.nsw.gov.au>, subscribe to the Fuel API product, create an app for a Client ID + Secret. Free tier: ~2,500 calls/month.
- **Token:** `GET https://api.onegov.nsw.gov.au/oauth/client_credential/accesstoken?grant_type=client_credentials` with header `Authorization: Basic base64(clientId:clientSecret)` → returns `access_token`. Cache it for the life of the request/short TTL.
- **Nearby prices:** `POST https://api.onegov.nsw.gov.au/FuelCheckApp/v1/fuel/prices/nearby`
  - Headers: `Authorization: Bearer <token>`, `apikey: <clientId>`, `Content-Type: application/json`, `transactionid: <uuid>`, `requesttimestamp: <dd/MM/yyyy hh:mm:ss AM/PM>`.
  - Body: `{ fueltype, latitude, longitude, namedlocation: "<lon>,<lat>", radius, sortby: "Price", sortascending: "true", brand: [] }`.
  - Response: `stations[]` (code, brand, name, address, location.latitude/longitude) and `prices[]` (stationcode, fueltype, price **in cents**, lastupdated as `dd/MM/yyyy HH:mm:ss`). Join prices to stations on `code`/`stationcode`.
- **Search radius:** start at 5 km; if fewer than 4 stations, expand to 10 km and re-query. Drop any station missing coordinates (can't route to it).
- The v1/v2 path occasionally moves — if `nearby` 404s, check current docs and update the constant.

### 8.3 ORS / HeiGIT (geocoding + routing) — server-side

HeiGIT runs OpenRouteService; **one ORS API key (from the HeiGIT account portal) serves both geocoding and routing.** Sign up at <https://openrouteservice.org/dev/#/signup>, create a Standard token. Free tier: 2,000 requests/day, 40/min.

- **Geocoding (address → coordinate):** `GET https://api.openrouteservice.org/geocode/search?api_key=<key>&text=<address>&boundary.country=AU&size=1`. Validate the result region is NSW; reject otherwise. (A `&boundary.rect.*` or `&focus.point.*` bias to NSW improves accuracy.)
- **Routing distances:** `POST https://api.openrouteservice.org/v2/matrix/driving-car` with header `Authorization: <key>`, body `{ locations: [[originLon,originLat], [s1Lon,s1Lat], ...], sources: [0], destinations: [1..n], metrics: ["distance"], units: "km" }`. One matrix call covers all stations and counts as a single request. Read `distances[0]` — the row from origin to each station.
- **Fallback:** if the matrix call fails or omits a leg, estimate that leg as `haversine_km × 1.3` (urban-driving heuristic) and flag the station's distance as an estimate in the UI.

> Note: the user's links included `account.heigit.org` for geocoding and `openrouteservice.org` for routing. These are the same platform — provision **one** key and use it for both endpoints. No separate geocoder is needed.

---

## 9. `/api/find-fuel` contract

**Request** (`POST`, JSON):

```json
{
  "address": "Lidcombe NSW",
  "fuelType": "U91",
  "fillMode": "full_tank",        // "full_tank" | "litres" | "dollars"
  "fillValue": null,               // litres or dollars when mode != full_tank; null = use tank default
  "consumption": 8.0,              // L/100km (from category or user override)
  "tank": 55                       // L (category default, used when full_tank)
}
```

**Response** (`200`, JSON):

```json
{
  "ok": true,
  "query": {
    "resolvedTo": "Lidcombe, Cumberland Council, NSW, Australia",
    "origin": { "lat": -33.86, "lon": 151.04 },
    "fuelType": "U91",
    "litresToFill": 55,
    "fillMode": "full_tank",
    "consumption": 8.0,
    "searchRadiusKm": 5
  },
  "stations": [
    {
      "code": "12345",
      "brand": "Costco",
      "name": "Costco Auburn",
      "address": "...",
      "lat": -33.84, "lon": 151.03,
      "priceCents": 176.9,
      "oneWayKm": 2.1,
      "distanceIsEstimate": false,
      "fillCostAud": 97.30,
      "burnedCostAud": 0.59,
      "totalCostAud": 97.89,
      "effectiveCpl": 178.0,
      "netLitres": null,
      "lastUpdatedIso": "2026-06-23T08:14:00Z",
      "lastUpdatedLabel": "2.1 h ago",
      "priceIsStale": false
    }
  ],
  "recommendation": {
    "stationCode": "12345",
    "vsNextCheapest": { "stationCode": "678", "cplSaved": 1.4, "dollarsSaved": 0.81 },
    "vsNearest":      { "stationCode": "999", "cplSaved": 3.2, "dollarsSaved": 1.74 },
    "bestIsHeadlineCheapest": true
  }
}
```

Stations are returned already sorted (true total cost ascending, or net litres descending in dollar mode). On failure return `{ "ok": false, "error": "<human-readable message>" }` with an appropriate status so the UI can show it directly.

---

## 10. Vehicle and fill defaults

| Category | Consumption (L/100km) | Default tank (L) |
|---|---|---|
| Small car / hatchback | 6.5 | 45 |
| Sedan | 8.0 | 55 |
| SUV | 9.0 | 60 |
| Large SUV / 4WD | 11.0 | 80 |

These are category averages. If a user later supplies their car's real economy or tank size, prefer those. Tank size only matters for the `full_tank` default litres; consumption drives the burn calc in every mode.

---

## 11. UI / UX

**Layout.** Left sidebar for inputs (roughly 320–380 px), map fills the rest of the viewport. On narrow screens the sidebar collapses to a top sheet / drawer.

**Sidebar (input).** Address field (free text, with a clear NSW hint and inline error state). Fuel-type as a 4-way segmented control. Vehicle category as 4 selectable cards or a segmented control. Fill mode as three options (Full tank / Litres / Dollars) revealing the relevant number field. A prominent "Find best value" button. After a search, the sidebar transitions to the ranked results list while keeping inputs editable above or behind a back affordance.

**Map.** Mapbox GL. Origin marker distinct from station markers. Station markers numbered by rank; the best-value marker is visually elevated (color + size + maybe a small "best value" badge). Clicking a marker focuses its card and vice-versa. Fit bounds to include origin + shown stations. A subtle line or just distance label is enough — no routed polyline required in v1.

**Station cards.** Each card: rank number, brand + name, address, headline price (large), one-way km (with an "est." chip if it's a fallback distance), price-age label (muted; amber if >24 h, red if >7 days), and the computed **true total** + **effective c/L**. The best card is highlighted.

**Savings panel.** A compact, high-contrast block near the top of the results: "Best value: **{brand}** on {address}. True cost to fill {N} L: **${total}**. That's **{c/L} effectively saved** and **${dollars} less** than the next-cheapest, and **{c/L} / ${dollars}** vs the nearest station." Collapse gracefully when best == cheapest == nearest.

**Tone of craft.** Real loading states (geocoding → fetching prices → routing), no layout shift, sensible empty/error states, keyboard-usable controls, legible type scale. Avoid the generic dashboard look: restrained palette, one accent color for "best value", generous spacing, fast transitions.

---

## 12. Edge cases and error handling

- **Non-NSW or ungeocodable address** → clear message; don't fall back to stale or out-of-state data.
- **Fewer than 4 stations at 5 km** → expand to 10 km; if still fewer, show what exists and say so.
- **No stations selling the chosen fuel within 10 km** → explicit empty state.
- **Routing call fails** → per-leg haversine × 1.3 fallback, each affected distance flagged "est." in the UI.
- **Stale prices** → label age; amber >24 h, red >7 days, but still rank them.
- **Dollar splash smaller than the drive cost** (`net_litres <= 0`) → flag the station as not worth the trip rather than erroring.
- **API quota / 429 / 5xx** → friendly retry message; never leak raw upstream errors or keys.

---

## 13. Configuration (environment variables)

| Variable | Scope | Purpose |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | client (public) | Mapbox GL map tiles. Restrict by URL in Mapbox dashboard. |
| `FUELCHECK_API_KEY` | server only | FuelCheck OAuth Client ID (also sent as `apikey`). |
| `FUELCHECK_API_SECRET` | server only | FuelCheck OAuth Client Secret. |
| `ORS_API_KEY` | server only | OpenRouteService / HeiGIT key — geocoding **and** routing. |

Server vars are set in Vercel project settings (and `.env.local` for dev). Only the `VITE_`-prefixed one is ever bundled into the client. Provide a `.env.example` documenting all four.

---

## 14. Tech stack and dependencies

- **Frontend:** Vite + React (JavaScript or TypeScript — TS recommended for the data shapes above). `mapbox-gl` for the map. A light state approach (React state / `useReducer` or Zustand); no heavy framework needed.
- **Backend:** Vercel Serverless Functions under `/api` (Node runtime). Native `fetch` for upstream calls; no SDKs required.
- **Hosting:** Vercel (frontend + functions in one project, one deploy).
- **Styling:** Tailwind or CSS Modules — pick one and keep it consistent. Aim for a deliberate, non-template look.
- No database. No auth. Nothing persisted.

---

## 15. Suggested project structure

```
/
├─ api/
│  └─ find-fuel.js          # the one-pass endpoint: geocode → prices → matrix → rank
├─ src/
│  ├─ main.jsx
│  ├─ App.jsx
│  ├─ components/
│  │  ├─ Sidebar.jsx        # inputs + results list
│  │  ├─ MapView.jsx        # Mapbox GL wrapper
│  │  ├─ StationCard.jsx
│  │  └─ SavingsPanel.jsx
│  ├─ lib/
│  │  └─ types.ts           # request/response shapes from §9
│  └─ styles/
├─ .env.example
├─ vercel.json              # if any routing/runtime config is needed
└─ PRODUCT_BRIEF.md         # this file
```

Keep the cost model in one server-side module so it has a single source of truth and is unit-testable in isolation.

---

## 16. Build milestones

1. **Scaffold.** Vite + React app, Vercel config, `.env.example`, a stub `/api/find-fuel` returning fixed JSON. Deploys green.
2. **Map shell.** Mapbox GL renders, sidebar layout in place, inputs wired to local state (no network yet).
3. **Backend pipeline.** Implement geocode → FuelCheck → ORS matrix → cost model in `/api/find-fuel`. Test with curl against the §9 contract.
4. **Wire it up.** Submit calls the endpoint; render station cards and markers from real data; fit map bounds.
5. **Recommendation + savings.** Best-value highlight, savings-vs-next-cheapest and vs-nearest panel, dollar-splash mode and its net-litres ranking.
6. **Polish + edge cases.** Loading/empty/error states, stale-price flags, distance-estimate chips, responsive sidebar, accessibility pass.

---

## 17. Acceptance criteria

- Entering a valid NSW location + fuel + vehicle + fill returns ≥ 4 stations ranked by true total cost (or net litres in dollar mode).
- Each station shows brand/name, address, c/L, one-way km, price age, and true total cost — on both a card and a map marker.
- The best-value option is unambiguous on screen, with correct savings vs next-cheapest and vs nearest in both c/L and dollars.
- A case exists in testing where the headline-cheapest station is **not** the best value, and the app surfaces it correctly.
- No server secret (FuelCheck secret, ORS key) is ever present in the client bundle or network tab.
- Graceful, specific handling of every edge case in §12.

---

## 18. Out of scope / future ideas

Diesel and LPG; saved vehicles and "use my usual" recall; price-trend history; multi-stop or "on my commute" routing; native apps; sharing a result link. None of these are needed for v1 and none should complicate the core cost-model code.

---

## 19. Open questions

- Confirm the exact NSW FuelCheck `nearby` path is still `v1` at build time (occasionally moves to `v2`).
- Decide TypeScript vs JavaScript before scaffolding (TS recommended).
- Confirm whether ORS geocoding accuracy for bare suburb names is acceptable, or whether to add a NSW bounding-box bias / focus point.
