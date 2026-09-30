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
- **Measured quality**: an evaluation harness runs 15 fixed trips through the real pipeline with deterministic checks, an LLM judge and a revision-loop ablation.
- **Budget math in code, not in the model**: models estimate prices; the backend adds them up, so totals, remaining budget and "over budget" status are always consistent.
- **Self-correcting**: a validator scores every plan (6 weighted categories). A low-scoring plan is revised once, and a revision is kept only if it scores higher.
- **Refine by chat**: "make day 2 more relaxed" re-plans the itinerary, re-validates it and saves a new version linked to the old one.
- **Shareable plans**: every plan has a URL (`/results?id=…`) backed by the API.
- **Honest data**: weather is labelled *forecast* vs *typical conditions*; flight and hotel prices are labelled as estimates and link to Google Flights / Booking.com with your dates pre-filled for live prices.
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

Request body:

```json
{
  "destination": "Tokyo, Japan",
  "origin": "San Francisco",
  "start_date": "2026-11-15",
  "end_date": "2026-11-21",
  "budget": 5000,
  "travelers": 2,
  "preferences": { "interests": ["food", "culture"], "pace": "moderate", "accommodation": "mid-range" }
}
```

`budget` is the total in USD for the whole group. `origin` is optional (without it, no flight estimates). `pace` is `relaxed | moderate | fast`; `accommodation` is `budget | mid-range | luxury`. Trips can be up to 21 days. The full response schema is in `orchestrator_backend/schemas.py`, mirrored in `frontend/lib/types.ts`.

## Evaluation

`orchestrator_backend/evals/` runs the real pipeline on 15 fixed trips. They cover 1–10 days, 1–10 travellers, tight and generous budgets, all paces and accommodation tiers, trips with and without an origin, a same-day trip, and a trip inside the forecast horizon. Each plan gets three kinds of score:

- **10 deterministic checks**: every day covered, consecutive dates, no empty days, slots per day within the pace limit, meals present, not over budget, no activity repeated across days, at least 70% of stops mapped, flights only when an origin is given, and grounded sources present.
- **LLM-as-judge**: an independent Gemini call scores realism, personalization, logistics and clarity from 1 to 5, each with a one-line rationale.
- **Cost and latency**: wall time, tokens and number of LLM calls per plan, taken from the agent trace.

```bash
cd orchestrator_backend
python -m evals.run_evals --limit 3                    # quick smoke run
python -m evals.run_evals                              # all 15 cases → evals/results/<timestamp>.json
python -m evals.run_evals --no-revision --compare evals/results/<full-run>.json   # ablation
```

Options: `--cases id1,id2`, `--no-judge`, `--delay 5` (seconds between cases, to stay within free-tier rate limits), `--out path.json`. The `--no-revision --compare` run turns off the validator's self-revision loop and prints how every metric differs from the full run, which measures what the revision loop actually adds. Evals call the real Gemini API, so they are not part of CI.

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
├── agents/            # one module per agent + base.py (Gemini client, grounding, retries, usage tracking)
├── api/routes.py      # FastAPI app: SSE streaming, rate limiting, plan storage
├── evals/             # evaluation harness: cases, checks, LLM judge, runner
├── utils/             # budget math, coordinate checks, storage (memory / MongoDB), logging
├── tests/             # offline tests with a fake LLM
├── orchestrator.py    # LangGraph workflow, tracing, refinement
├── schemas.py         # API contract
├── config.py
├── Dockerfile
└── main.py
frontend/
├── app/               # /, /plan, /results
├── components/        # home, plan form, results sections, trace graph/timeline, map
└── lib/               # API client (SSE), types, calendar export, formatting
render.yaml            # Render blueprint for the backend
.github/workflows/     # CI
```

## Testing

```bash
cd orchestrator_backend && pip install -r requirements-dev.txt && pytest
cd frontend && npm run typecheck && npm run lint && npm run build
```

Backend tests run fully offline: a fake generator replaces Gemini, covering the graph, parallelism, tracing, revision logic, budget math, coordinate filtering, streaming, sharing, refinement and the eval checks.

## Limitations

- Flight and hotel prices are model estimates, not live fares. Real-time pricing would need a travel data API (e.g. SerpApi Google Flights/Hotels, Duffel).
- The rate limiter and in-memory store are per-process; use MongoDB and a shared rate limiter for multi-instance deployments.
- AI-generated plans can contain mistakes. Always verify prices, opening hours and travel advisories before booking.

## License

MIT, see [LICENSE](LICENSE).
