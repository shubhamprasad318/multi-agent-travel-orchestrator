"""FastAPI application.

Endpoints:
    GET  /health                   service status and which integrations are configured
    POST /api/v1/plan              create a plan (blocking JSON response)
    POST /api/v1/plan/stream       create a plan with Server-Sent Events progress
    GET  /api/v1/plans/{plan_id}   fetch a previously created plan (shareable link)
    DELETE /api/v1/plans/{plan_id}  delete a saved plan
    POST /api/v1/plans/{plan_id}/refine     apply a change request, saved as a new version
    PUT  /api/v1/plans/{plan_id}/itinerary  save a hand-edited itinerary as a new version
    POST /api/v1/plans/{plan_id}/chat       ask the concierge about a plan
"""

import asyncio
import json
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from agents import chat_agent
from agents.base import AgentContext, LLMUnavailableError, gemini_generator
from config import Settings, get_settings
from orchestrator import PlanningError, create_plan, edit_plan, refine_plan
from schemas import ChatReply, ChatRequest, ItineraryEdit, RefineRequest, TravelPlan, TravelRequest
from utils.logger import configure_logging, get_logger
from utils.store import MemoryStore, Store, create_store

logger = get_logger(__name__)

PLANS_COLLECTION = "plans"
PLAN_TTL_SECONDS = 30 * 24 * 3600
SSE_HEARTBEAT_SECONDS = 15


class RateLimiter:
    """Sliding-window limit per client key. In-memory: one limiter per process."""

    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> bool:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > 60:
            hits.popleft()
        if len(hits) >= self.per_minute:
            return False
        hits.append(now)
        return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.debug)
    if not settings.has_llm:
        logger.error("GOOGLE_API_KEY is not set. Planning requests will fail.")
    app.state.settings = settings
    app.state.store = await create_store(settings.mongodb_uri, settings.database_name)
    app.state.generate = gemini_generator(settings)
    app.state.limiter = RateLimiter(settings.rate_limit_per_minute)
    app.state.chat_limiter = RateLimiter(settings.chat_rate_limit_per_minute)
    app.state.semaphore = asyncio.Semaphore(settings.max_concurrent_plans)
    yield
    await app.state.store.close()


app = FastAPI(title="Multi-Agent Travel Orchestrator", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """Turn Pydantic's error list into one readable message for the UI."""
    messages = []
    for error in exc.errors():
        field = ".".join(str(p) for p in error.get("loc", []) if p not in ("body",))
        msg = str(error.get("msg", "invalid value")).removeprefix("Value error, ")
        messages.append(f"{field}: {msg}" if field else msg)
    return JSONResponse(status_code=422, content={"detail": "; ".join(messages) or "Invalid request"})


def get_store(request: Request) -> Store:
    return request.app.state.store


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def guard_planning(request: Request) -> None:
    settings: Settings = request.app.state.settings
    if not settings.has_llm:
        raise HTTPException(503, "The planner is not configured: GOOGLE_API_KEY is not set on the server.")
    if not request.app.state.limiter.check(_client_key(request)):
        raise HTTPException(429, "Too many plans requested. Please wait a minute and try again.")


async def guard_chat(request: Request) -> None:
    settings: Settings = request.app.state.settings
    if not settings.has_llm:
        raise HTTPException(503, "The concierge is not configured: GOOGLE_API_KEY is not set on the server.")
    if not request.app.state.chat_limiter.check(_client_key(request)):
        raise HTTPException(429, "You're asking questions very quickly. Please wait a moment.")


def _context(request: Request, emit=None) -> AgentContext:
    ctx = AgentContext(
        settings=request.app.state.settings,
        store=request.app.state.store,
        generate=request.app.state.generate,
        # Tests swap in fixed exchange rates; production uses utils.fx.
        fx=getattr(request.app.state, "fx", None),
    )
    if emit is not None:
        ctx.emit = emit
    return ctx


async def _save(store: Store, plan: TravelPlan) -> dict[str, Any]:
    data = plan.model_dump(mode="json")
    await store.set(PLANS_COLLECTION, plan.id, data, ttl=PLAN_TTL_SECONDS)
    return data


@app.get("/health")
async def health(request: Request) -> dict[str, Any]:
    settings: Settings = request.app.state.settings
    return {
        "status": "healthy" if settings.has_llm else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "llm_configured": settings.has_llm,
        "model": settings.gemini_model,
        "grounding_enabled": settings.enable_grounding,
        "storage": "memory" if isinstance(request.app.state.store, MemoryStore) else "mongodb",
    }


@app.post("/api/v1/plan", response_model=TravelPlan, dependencies=[Depends(guard_planning)])
async def plan_trip(body: TravelRequest, request: Request) -> dict[str, Any]:
    semaphore: asyncio.Semaphore = request.app.state.semaphore
    async with semaphore:
        try:
            plan = await create_plan(_context(request), body)
        except PlanningError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc
    return await _save(request.app.state.store, plan)


def _sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@app.post("/api/v1/plan/stream", dependencies=[Depends(guard_planning)])
async def plan_trip_stream(body: TravelRequest, request: Request) -> StreamingResponse:
    queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()

    async def emit(event: dict[str, Any]) -> None:
        await queue.put(("progress", event))

    async def run() -> None:
        async with request.app.state.semaphore:
            try:
                plan = await create_plan(_context(request, emit), body)
                await queue.put(("result", await _save(request.app.state.store, plan)))
            except PlanningError as exc:
                await queue.put(("error", {"detail": str(exc)}))
            except Exception:  # noqa: BLE001
                logger.exception("Unexpected planning failure")
                await queue.put(("error", {"detail": "Something went wrong while planning. Please try again."}))

    async def events() -> AsyncIterator[str]:
        task = asyncio.create_task(run())
        try:
            while True:
                try:
                    kind, data = await asyncio.wait_for(queue.get(), timeout=SSE_HEARTBEAT_SECONDS)
                except TimeoutError:
                    if await request.is_disconnected():
                        break
                    yield ": keep-alive\n\n"
                    continue
                yield _sse(kind, data)
                if kind in ("result", "error"):
                    break
        finally:
            # Stop spending LLM tokens if the browser went away.
            if not task.done():
                task.cancel()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _load(store: Store, plan_id: str) -> dict[str, Any]:
    data = await store.get(PLANS_COLLECTION, plan_id) if plan_id.isalnum() and len(plan_id) == 32 else None
    if data is None:
        raise HTTPException(404, "Plan not found or expired")
    return data


@app.get("/api/v1/plans/{plan_id}", response_model=TravelPlan)
async def get_plan(plan_id: str, store: Store = Depends(get_store)) -> JSONResponse:
    # Stored plans are returned as saved; re-validating would reject
    # trips whose start date has since passed.
    return JSONResponse(await _load(store, plan_id))


@app.post("/api/v1/plans/{plan_id}/refine", response_model=TravelPlan, dependencies=[Depends(guard_planning)])
async def refine(plan_id: str, body: RefineRequest, request: Request) -> JSONResponse:
    store: Store = request.app.state.store
    plan = TravelPlan.model_validate(await _load(store, plan_id), context={"stored": True})
    if plan.itinerary is None:
        raise HTTPException(409, "This plan has no itinerary to refine.")
    async with request.app.state.semaphore:
        try:
            refined = await refine_plan(_context(request), plan, body.instruction)
        except PlanningError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc
    return JSONResponse(await _save(store, refined))


@app.put("/api/v1/plans/{plan_id}/itinerary", response_model=TravelPlan, dependencies=[Depends(guard_planning)])
async def save_itinerary(plan_id: str, body: ItineraryEdit, request: Request) -> JSONResponse:
    store: Store = request.app.state.store
    plan = TravelPlan.model_validate(await _load(store, plan_id), context={"stored": True})
    async with request.app.state.semaphore:
        try:
            edited = await edit_plan(_context(request), plan, body.itinerary, body.note)
        except PlanningError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc
    return JSONResponse(await _save(store, edited))


@app.post("/api/v1/plans/{plan_id}/chat", response_model=ChatReply, dependencies=[Depends(guard_chat)])
async def chat(plan_id: str, body: ChatRequest, request: Request) -> ChatReply:
    plan = TravelPlan.model_validate(await _load(request.app.state.store, plan_id), context={"stored": True})
    try:
        return await chat_agent.run(_context(request), plan, body.messages)
    except LLMUnavailableError as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        logger.exception("chat failed")
        raise HTTPException(502, "The concierge couldn't answer that. Please try again.") from exc


@app.delete("/api/v1/plans/{plan_id}", status_code=204)
async def delete_plan(plan_id: str, store: Store = Depends(get_store)) -> Response:
    await _load(store, plan_id)
    await store.delete(PLANS_COLLECTION, plan_id)
    return Response(status_code=204)
