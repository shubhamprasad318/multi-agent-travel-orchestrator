# 🌍 Multi-Agent Travel Orchestrator

An AI travel planner in which six specialised agents, orchestrated with **LangGraph** and powered by **Google Gemini**, research a destination, check the weather, curate activities, estimate flights and hotels, build a day-by-day itinerary, and validate the result. You can then refine the plan in plain language.

Runs on a single free **Google AI Studio** key.

![Python](https://img.shields.io/badge/Python-3.11+-blue)
![Next.js](https://img.shields.io/badge/Next.js-15.5-black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green)
![LangGraph](https://img.shields.io/badge/LangGraph-1.x-orange)
![Gemini](https://img.shields.io/badge/Gemini-3.x-4285F4)

---

## Features

- **Live agent graph**: while planning, the UI draws the actual LangGraph workflow and lights up each agent as it starts and finishes (streamed over Server-Sent Events), with a running timeline that makes the parallelism visible.
- **Behind the scenes**: every plan keeps a trace of each agent run (duration, tokens, Gemini calls, web sources, and a one-line outcome such as *"Score 54/100: below 60, sending back for revision"*), plus the parallel speed-up.
- **Interactive map**: numbered, colour-coded stops for each day with route lines (Leaflet + OpenStreetMap). Implausible coordinates are filtered out in code.
- **Grounded research**: agents use Gemini's built-in Google Search grounding, returning structured JSON *and* the sources they used, in a single call.
- **Parallel agent graph**: weather runs alongside research; activities and bookings run in parallel; the itinerary waits for all three.
- **Measured quality**: an evaluation harness runs 16 fixed trips through the real pipeline with deterministic checks, an LLM judge and a revision-loop ablation; the **/evals** dashboard tracks every run over time.
- **Budget math in code, not in the model**: models estimate prices; the backend adds them up, so totals, remaining budget and "over budget" status are always consistent.
- **Self-correcting**: a validator scores every plan (6 weighted categories). A low-scoring plan is revised once, and a revision is kept only if it scores higher.
- **Refine by chat**: "make day 2 more relaxed" re-plans the itinerary, re-validates it and saves a new version linked to the old one.
- **Your currency, plus the local one**: plan in any of 160+ currencies (auto-detected from your browser). Every price shows your currency with the destination's alongside, e.g. ₹2,800 · ¥5,000, using live exchange rates frozen at planning time.
- **Chat with your trip**: a concierge answers questions about *your* plan ("what should I pack for day 2?"), uses Google Search for current facts, and can turn a request into a one-click change.
- **Drag & drop editing**: move stops between days, edit or delete them, add your own; costs and the map update live, and saving creates a re-scored new version.
- **Budget charts**: where the money goes (by category, against your budget), spend per day, and a per-person split.
- **Multi-city trips**: plan a route (e.g. Tokyo → Kyoto → Osaka, up to 5 cities) with nights per city. Every agent plans per city: each day is spent in the right place, there's a hotel per city, and the trains or flights between cities are priced into the budget.
- **Re-plan a single day**: "heavy rain on day 3" or "we're tired" rewrites only that day (weather-aware, avoiding stops from other days); the rest of the trip stays exactly as it was.
- **Accounts (Google sign-in, optional)**: your trips follow you to every device; trips planned before signing in are saved to your account the first time you sign in.
- **Plan together**: share an invite link; friends who join can vote 👍/👎 on stops, comment on them and change the plan. Votes and comments stay attached to a stop across versions.
- **Get ready**: a categorised packing list from the weather agent and dated to-dos worked out from the plan (passports, bookings, insurance, currency, check-in), with a checklist saved to your account and reminders you can add to your calendar.
- **Works offline**: an installable app (PWA); save a trip offline and its itinerary opens with no signal.
- **My trips**: every plan you make is listed with its photo, versions, cost and score; compare two trips side by side, or delete them.
- **Shareable plans**: every plan has a URL (`/results?id=…`) backed by the API.
- **Honest data**: weather is labelled *forecast* vs *typical conditions*; flight and hotel prices are labelled as estimates and link to Google Flights / Booking.com with your dates pre-filled for live prices. With a free Travelpayouts token, real **recent fares** (what other travellers paid in the last few days, via Aviasales) are shown next to the estimates.
- **Export**: add the itinerary to your calendar (`.ics`) or print / save as PDF (all sections).
- **Graceful degradation**: if one agent fails, the rest of the plan is still returned and the UI says which part is missing.

## Architecture

```
            ┌────────────── Next.js 15 frontend ──────────────┐
            │  /plan (form + live progress)   /results?id=…   │
            └───────────────┬───────────────────────▲─────────┘
               POST /api/v1/plan/stream (SSE)     GET /api/v1/plans/{id}
                                                   POST /api/v1/plans/{id}/refine
            ┌───────────────▼───────── FastAPI ───────────────┐
            │                  LangGraph                       │
            │  START ─┬─> research ─┬─> activity ──┐           │
            │         │             └─> booking ───┼─> itinerary ─> validator ─┬─> END
            │         └─> weather ─────────────────┘                ▲          │
            │                                                     revision <──┘ (score < 60, once)
            └───────────────┬──────────────────────────────────────┘
                            ▼
                 Gemini API (+ Google Search grounding)
```

| Agent | Grounded | Produces |
|-------|----------|----------|
| Research | ✅ | Overview, highlights, neighbourhoods, etiquette, safety, transport, sources |
| Weather | ✅ when the trip is ≤ 10 days away | Per-day conditions (forecast or climate average), packing list, advisories |
| Activity | ✅ | 12–18 named activities across categories with cost/duration |
| Booking | ✅ | Flight and hotel estimates; code adds group totals and search links |
| Itinerary | – | Day-by-day plan within the budget left after flights and lodging |
| Validator | – | Category scores; code adds budget score, weighting and status |
| Day re-planner | ✅ | On request, after a plan exists: one day rewritten for a change (rain, a closure, tired legs), other days untouched |

## Quick start

### Prerequisites
- Python 3.11+
- Node.js 18.18+
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) (free tier works)

### Backend

```bash
cd orchestrator_backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
cp .env.example .env            # then set GOOGLE_API_KEY
python main.py                  # http://localhost:8000  (docs at /docs)
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local      # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                     # http://localhost:3000
```

## Configuration (`orchestrator_backend/.env`)

| Variable | Default | Notes |
|----------|---------|-------|
| `GOOGLE_API_KEY` | – | **Required.** |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini 2.5 models are closed to new projects; use a 3.x model. |
| `ENABLE_GROUNDING` | `true` | Google Search grounding. Automatically switches off if your key/model doesn't support it. |
| `MONGODB_URI` | – | Optional. Without it, plans are kept in memory and lost on restart. |
| `CORS_ORIGINS` | `["http://localhost:3000"]` | JSON list of allowed frontend origins. |
| `RATE_LIMIT_PER_MINUTE` | `5` | Planning requests per client IP. |
| `MAX_CONCURRENT_PLANS` | `2` | Keep low on the free tier (each plan makes ~7 Gemini calls). |
| `DEBUG` | `false` | Includes agent error details in responses. |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.5-flash-lite` | Used when the main model is overloaded or out of quota. |
| `CHAT_RATE_LIMIT_PER_MINUTE` | `20` | Concierge questions per client IP. |
| `GOOGLE_CLIENT_ID` | – | Optional. Turns on Google sign-in (accounts, trip sync, planning together). See below. |
| `AUTH_SECRET` | random | Signs session tokens. Set a long random value in production, or everyone is signed out on restart. |
| `SESSION_DAYS` | `30` | How long a sign-in lasts. |
| `TRAVELPAYOUTS_TOKEN` | – | Optional, free. Adds real recent fares for flights (see below). |
| `TRAVELPAYOUTS_MARKER` | – | Optional Travelpayouts affiliate marker for Aviasales links. |

Exchange rates come from [open.er-api.com](https://www.exchangerate-api.com/docs/free) (free, no key) and are cached for 12 hours.

**Google sign-in (optional, free).** In [Google Cloud console → Credentials](https://console.cloud.google.com/apis/credentials), create an *OAuth client ID* of type *Web application* and add your frontend's origins (e.g. `http://localhost:3000` and your Vercel URL) under *Authorized JavaScript origins*. Put the client id in the backend's `GOOGLE_CLIENT_ID` (the frontend reads it from the backend, or from `NEXT_PUBLIC_GOOGLE_CLIENT_ID`). Without it, the app works exactly as before, signed out.

**Recent fares (optional, free).** Sign up at [Travelpayouts](https://www.travelpayouts.com), join the Aviasales program and copy your API token into `TRAVELPAYOUTS_TOKEN`. The [Aviasales Data API](https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API) returns cached fares from real searches made in the last few days (not live prices, and no hotels), so they're labelled "recent fare". Routes nobody searched recently simply keep the estimates.

Agent temperatures, token limits and thinking levels live in `AGENT_CONFIG` in `config.py`; validation thresholds and weights live in `VALIDATION_CONFIG`.

> **Grounding note:** Google's terms for Grounding with Google Search include display requirements for search suggestions. Review them before deploying publicly.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Status, model, grounding and storage info |
| `POST` | `/api/v1/plan` | Create a plan (JSON response) |
| `POST` | `/api/v1/plan/stream` | Create a plan with SSE `progress` events, then a `result` or `error` event |
| `GET` | `/api/v1/plans/{id}` | Fetch a saved plan |
| `POST` | `/api/v1/plans/{id}/refine` | `{"instruction": "..."}` → a new plan version |
| `PUT` | `/api/v1/plans/{id}/itinerary` | `{"itinerary": {...}}` (hand-edited) → a new, re-scored plan version |
| `POST` | `/api/v1/plans/{id}/chat` | `{"messages": [{"role": "user", "content": "..."}]}` → concierge answer, sources, optional change request |
| `DELETE` | `/api/v1/plans/{id}` | Delete a saved plan (only its owner, for plans made while signed in) |
| `POST` | `/api/v1/plans/{id}/days/{day}/replan` | `{"reason": "heavy rain all day"}` → a new version with only that day re-planned |
| `POST` | `/api/v1/plans/{id}/copy` | A copy owned by the signed-in user |
| `POST` | `/api/v1/auth/google` | `{"credential": "<Google ID token>"}` → `{"token", "user"}`; send the token as `Authorization: Bearer …` |
| `GET` | `/api/v1/me/trips` | The signed-in user's trips (own, shared with them, saved) |
| `PUT` | `/api/v1/me/saved` | `{"plan_ids": [...]}` → save trips to the account |
| `GET` | `/api/v1/plans/{id}/collab` | Members, votes and comments (for the owner and invited friends) |
| `POST` / `DELETE` | `/api/v1/plans/{id}/invite` | Create or turn off the invite link (owner) |
| `POST` | `/api/v1/plans/{id}/join` | `{"code": "..."}` → join a trip from its invite link |
| `PUT` | `/api/v1/plans/{id}/votes/{stop_id}` | `{"value": 1 \| -1 \| 0}` |
| `POST` | `/api/v1/plans/{id}/comments` | `{"slot_id": "...", "text": "..."}` |
| `GET` / `PUT` | `/api/v1/plans/{id}/checklist` | The signed-in traveller's packing and to-do checklist |
| `GET` | `/api/v1/evals`, `/api/v1/evals/{run}` | Saved evaluation runs, for the dashboard |

Plans made while signed out can be viewed and changed by anyone with the link, as before. Plans made while signed in can be viewed by anyone with the link, but only changed by the owner and friends who joined through the invite link. Votes, comments, members and checklists belong to the trip (every version of it).

Request body:

```json
{
  "destination": "Tokyo, Japan",
  "origin": "San Francisco",
  "start_date": "2026-11-15",
  "end_date": "2026-11-21",
  "budget": 400000,
  "currency": "INR",
  "travelers": 2,
  "preferences": { "interests": ["food", "culture"], "pace": "moderate", "accommodation": "mid-range" }
}
```

`budget` is the total for the whole group, in `currency` (ISO 4217, default `USD`). Agents plan in USD internally; the response's `money` object carries the exchange rates (your currency and the destination's) used for display, and every amount in the response is in USD. `origin` is optional (without it, no flight estimates). For a multi-city trip, send `"stops": [{"destination": "Tokyo, Japan", "nights": 3}, {"destination": "Kyoto, Japan", "nights": 2}]` instead of a destination: the nights must add up to the trip's nights, and you move on to the next city on the morning after your last night there. `pace` is `relaxed | moderate | fast`; `accommodation` is `budget | mid-range | luxury`. Trips can be up to 21 days. The full response schema is in `orchestrator_backend/schemas.py`, mirrored in `frontend/lib/types.ts`.

## Evaluation

`orchestrator_backend/evals/` runs the real pipeline on 16 fixed trips. They cover 1–10 days, 1–10 travellers, tight and generous budgets, all paces and accommodation tiers, trips with and without an origin, a same-day trip, a trip inside the forecast horizon and a multi-city route. Each plan gets three kinds of score:

- **11 deterministic checks**: every day covered, consecutive dates, no empty days, slots per day within the pace limit, meals present, not over budget, no activity repeated across days, at least 70% of stops mapped, multi-city routes followed (right city each day, a hotel per city, a transfer per move), flights only when an origin is given, and grounded sources present.
- **LLM-as-judge**: an independent Gemini call scores realism, personalization, logistics and clarity from 1 to 5, each with a one-line rationale.
- **Cost and latency**: wall time, tokens and number of LLM calls per plan, taken from the agent trace.

```bash
cd orchestrator_backend
python -m evals.run_evals --limit 3                    # quick smoke run
python -m evals.run_evals                              # all 16 cases → evals/results/<timestamp>.json
python -m evals.run_evals --no-revision --compare evals/results/<full-run>.json   # ablation
```

Options: `--cases id1,id2`, `--no-judge`, `--delay 5` (seconds between cases, to stay within free-tier rate limits), `--out path.json`. The `--no-revision --compare` run turns off the validator's self-revision loop and prints how every metric differs from the full run, which measures what the revision loop actually adds. Evals call the real Gemini API, so they are not part of CI.

The **/evals** page charts every saved run: headline metrics against an earlier run, a trend per metric (ablation runs drawn hollow), pass rates per check and each trip's checks and judge reasons. It reads `evals/results/` from the backend; results aren't baked into the Docker image, so on a deployed site use **Open results files** to view runs from your machine (they're read in the browser, not uploaded).

## Deployment

**Backend on Render** (free), using `render.yaml`:
1. On Render, choose **New → Blueprint** and select this repo. It builds `orchestrator_backend/Dockerfile`.
2. When prompted, set:
   - `GOOGLE_API_KEY`
   - `CORS_ORIGINS`: your Vercel URL, e.g. `https://your-app.vercel.app`. Comma-separate several URLs, or give a JSON list.
   - `MONGODB_URI`: recommended. Render's free instances sleep when idle, and the in-memory store loses saved plans and share links when that happens. A free **MongoDB Atlas** cluster keeps them.
3. The health check is at `/health`. Uvicorn runs with `--proxy-headers`, so rate limiting sees real client IPs. The same image also runs on Google Cloud Run.

**Frontend on Vercel:**
1. Import the repo and set **Root Directory** to `frontend`.
2. Add the environment variable `NEXT_PUBLIC_API_URL` = your Render URL.
3. Deploy, then put the Vercel URL into the backend's `CORS_ORIGINS`.

**CI:** `.github/workflows/ci.yml` runs on every push and pull request. It runs the backend tests offline (a fake LLM, so no key is needed) and the frontend typecheck, lint and production build.

## Project structure

```
orchestrator_backend/
├── agents/            # one module per agent (+ day re-planner, concierge) + base.py (Gemini client, grounding, retries, usage)
├── api/               # routes.py (planning, SSE), auth.py (Google sign-in, my trips), collab.py (sharing, votes, comments,
│                      #   checklists), evals.py (dashboard data), common.py (storage and access rules)
├── evals/             # evaluation harness: cases, checks, LLM judge, runner
├── utils/             # budget math, coordinates, storage (memory / MongoDB), exchange rates, fares, sessions, logging
├── tests/             # offline tests with a fake LLM
├── orchestrator.py    # LangGraph workflow, tracing, refinement
├── schemas.py         # API contract
├── config.py
├── Dockerfile
└── main.py
frontend/
├── app/               # /, /plan, /results, /trips, /evals, /offline, web manifest
├── components/        # home, plan form, results sections, trace graph/timeline, map
├── lib/               # API client (SSE), types, sign-in, collaboration, offline storage, trip prep, calendar export
└── public/sw.js       # service worker: installable app, saved trips open offline
render.yaml            # Render blueprint for the backend
.github/workflows/     # CI
```

## Testing

```bash
cd orchestrator_backend && pip install -r requirements-dev.txt && pytest
cd frontend && npm run typecheck && npm run lint && npm run build
```

Backend tests run fully offline: a fake generator replaces Gemini (and fakes stand in for Google sign-in, exchange rates and fares), covering the graph, parallelism, tracing, revision logic, budget math, coordinate filtering, streaming, sharing, refinement, multi-city routes, day re-planning, accounts, planning together, checklists and the eval checks.

## Limitations

- Hotel prices, and flight prices without a Travelpayouts token, are model estimates, not live fares. Recent fares are cached from other travellers' searches and cover only single-destination round trips. Real-time pricing would need a paid travel data API (e.g. Duffel).
- The rate limiter and in-memory store are per-process; use MongoDB and a shared rate limiter for multi-instance deployments.
- AI-generated plans can contain mistakes. Always verify prices, opening hours and travel advisories before booking.

## License

MIT, see [LICENSE](LICENSE).
