"""FastAPI application.

Endpoints:
    GET    /health                                   service status and which integrations are configured
    POST   /api/v1/plan                              create a plan (blocking JSON response)
    POST   /api/v1/plan/stream                       create a plan with Server-Sent Events progress
    GET    /api/v1/plans/{plan_id}                   fetch a previously created plan (shareable link)
    DELETE /api/v1/plans/{plan_id}                   delete a saved plan
    POST   /api/v1/plans/{plan_id}/refine            apply a change request, saved as a new version
    POST   /api/v1/plans/{plan_id}/days/{day}/replan re-plan one day (e.g. rain), saved as a new version
    PUT    /api/v1/plans/{plan_id}/itinerary         save a hand-edited itinerary as a new version
    POST   /api/v1/plans/{plan_id}/copy              copy a plan into the signed-in user's account
    POST   /api/v1/plans/{plan_id}/chat              ask the concierge about the plan

Accounts, trip sharing (members, votes, comments, checklists) and the
evaluation dashboard live in `api/auth.py`, `api/collab.py` and `api/evals.py`.
"""

import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from fastapi import Depends, FastAPI, HTTPException, Path, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from agents import chat_agent
from agents.base import LLMUnavailableError, gemini_generator
from api import auth, collab, evals
from api.common import (
    PLANS_COLLECTION,
    TRIPS_COLLECTION,
    RateLimiter,
    client_key,
    context,
    get_store,
    load_plan,
    load_plan_data,
    optional_user,
    require_edit,
    require_user,
    root_of,
    save_plan,
)
from config import Settings, get_settings
from orchestrator import PlanningError, create_plan, edit_plan, refine_plan, replan_day
from schemas import ChatReply, ChatRequest, ItineraryEdit, RefineRequest, ReplanDayRequest, TravelPlan, TravelRequest
from utils.auth import SessionSigner, google_verifier
from utils.logger import configure_logging, get_logger
from utils.store import MemoryStore, Store, create_store

logger = get_logger(__name__)

SSE_HEARTBEAT_SECONDS = 15


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
    # Votes, comments and checklist saves are cheap but shouldn't be spammable.
    app.state.collab_limiter = RateLimiter(120)
    app.state.semaphore = asyncio.Semaphore(settings.max_concurrent_plans)
    app.state.signer = SessionSigner(settings.auth_secret, settings.session_days)
    app.state.verify_google = google_verifier(settings.google_client_id) if settings.auth_enabled else None
    if settings.auth_enabled and not settings.auth_secret:
        logger.warning("AUTH_SECRET is not set: sessions end whenever the server restarts.")
    yield
    await app.state.store.close()


app = FastAPI(title="Multi-Agent Travel Orchestrator", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)
app.include_router(auth.router)
app.include_router(collab.router)
app.include_router(evals.router)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """Turn Pydantic's error list into one readable message for the UI."""
    messages = []
    for error in exc.errors():
        field = ".".join(str(p) for p in error.get("loc", []) if p not in ("body",))
        msg = str(error.get("msg", "invalid value")).removeprefix("Value error, ")
        messages.append(f"{field}: {msg}" if field else msg)
    return JSONResponse(status_code=422, content={"detail": "; ".join(messages) or "Invalid request"})


async def guard_planning(request: Request) -> None:
    settings: Settings = request.app.state.settings
    if not settings.has_llm:
        raise HTTPException(503, "The planner is not configured: GOOGLE_API_KEY is not set on the server.")
    if not request.app.state.limiter.check(client_key(request)):
        raise HTTPException(429, "Too many plans requested. Please wait a minute and try again.")


async def guard_chat(request: Request) -> None:
    settings: Settings = request.app.state.settings
    if not settings.has_llm:
        raise HTTPException(503, "The concierge is not configured: GOOGLE_API_KEY is not set on the server.")
    if not request.app.state.chat_limiter.check(client_key(request)):
        raise HTTPException(429, "You're asking questions very quickly. Please wait a moment.")


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
        "accounts_enabled": settings.auth_enabled,
        "recent_fares_enabled": bool(settings.travelpayouts_token),
    }


@app.post("/api/v1/plan", response_model=TravelPlan, dependencies=[Depends(guard_planning)])
async def plan_trip(body: TravelRequest, request: Request, user_id: str | None = Depends(optional_user)) -> dict[str, Any]:
    semaphore: asyncio.Semaphore = request.app.state.semaphore
    async with semaphore:
        try:
            plan = await create_plan(context(request), body, owner_id=user_id)
        except PlanningError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc
    return await save_plan(request.app.state.store, plan)


def _sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@app.post("/api/v1/plan/stream", dependencies=[Depends(guard_planning)])
async def plan_trip_stream(body: TravelRequest, request: Request, user_id: str | None = Depends(optional_user)) -> StreamingResponse:
    queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()

    async def emit(event: dict[str, Any]) -> None:
        await queue.put(("progress", event))

    async def run() -> None:
        async with request.app.state.semaphore:
            try:
                plan = await create_plan(context(request, emit), body, owner_id=user_id)
                await queue.put(("result", await save_plan(request.app.state.store, plan)))
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


@app.get("/api/v1/plans/{plan_id}", response_model=TravelPlan)
async def get_plan(plan_id: str, store: Store = Depends(get_store)) -> JSONResponse:
    # Stored plans are returned as saved; re-validating would reject
    # trips whose start date has since passed.
    return JSONResponse(await load_plan_data(store, plan_id))


async def _editable_plan(request: Request, plan_id: str, user_id: str | None) -> TravelPlan:
    plan = await load_plan(request.app.state.store, plan_id)
    await require_edit(request.app.state.store, plan, user_id)
    return plan


@app.post("/api/v1/plans/{plan_id}/refine", response_model=TravelPlan, dependencies=[Depends(guard_planning)])
async def refine(plan_id: str, body: RefineRequest, request: Request, user_id: str | None = Depends(optional_user)) -> JSONResponse:
    plan = await _editable_plan(request, plan_id, user_id)
    if plan.itinerary is None:
        raise HTTPException(409, "This plan has no itinerary to refine.")
    async with request.app.state.semaphore:
        try:
            refined = await refine_plan(context(request), plan, body.instruction)
        except PlanningError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc
    return JSONResponse(await save_plan(request.app.state.store, refined))


@app.post("/api/v1/plans/{plan_id}/days/{day}/replan", response_model=TravelPlan, dependencies=[Depends(guard_planning)])
async def replan(
    plan_id: str,
    body: ReplanDayRequest,
    request: Request,
    day: int = Path(ge=1, le=60),
    user_id: str | None = Depends(optional_user),
) -> JSONResponse:
    plan = await _editable_plan(request, plan_id, user_id)
    async with request.app.state.semaphore:
        try:
            updated = await replan_day(context(request), plan, day, body.reason)
        except PlanningError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc
    return JSONResponse(await save_plan(request.app.state.store, updated))


@app.put("/api/v1/plans/{plan_id}/itinerary", response_model=TravelPlan, dependencies=[Depends(guard_planning)])
async def save_itinerary(plan_id: str, body: ItineraryEdit, request: Request, user_id: str | None = Depends(optional_user)) -> JSONResponse:
    plan = await _editable_plan(request, plan_id, user_id)
    async with request.app.state.semaphore:
        try:
            edited = await edit_plan(context(request), plan, body.itinerary, body.note)
        except PlanningError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc
    return JSONResponse(await save_plan(request.app.state.store, edited))


@app.post("/api/v1/plans/{plan_id}/copy", response_model=TravelPlan)
async def copy_plan(plan_id: str, request: Request, user_id: str = Depends(require_user)) -> JSONResponse:
    """A copy the signed-in user owns: a new trip they control and can invite friends to."""
    plan = await load_plan(request.app.state.store, plan_id)
    new_id = uuid.uuid4().hex
    copy = plan.model_copy(
        update={
            "id": new_id,
            "root_id": new_id,
            "owner_id": user_id,
            "parent_id": None,
            "version": 1,
            "created_at": datetime.now(timezone.utc),
            "refinements": [],
        }
    )
    return JSONResponse(await save_plan(request.app.state.store, copy))


@app.post("/api/v1/plans/{plan_id}/chat", response_model=ChatReply, dependencies=[Depends(guard_chat)])
async def chat(plan_id: str, body: ChatRequest, request: Request) -> ChatReply:
    plan = await load_plan(request.app.state.store, plan_id)
    try:
        return await chat_agent.run(context(request), plan, body.messages)
    except LLMUnavailableError as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        logger.exception("chat failed")
        raise HTTPException(502, "The concierge couldn't answer that. Please try again.") from exc


@app.delete("/api/v1/plans/{plan_id}", status_code=204)
async def delete_plan(plan_id: str, request: Request, user_id: str | None = Depends(optional_user)) -> Response:
    store: Store = request.app.state.store
    plan = await load_plan_data(store, plan_id)
    owner = plan.get("owner_id")
    if owner is not None and owner != user_id:
        raise HTTPException(401 if user_id is None else 403, "Only the trip's owner can delete it.")
    await store.delete(PLANS_COLLECTION, plan_id)
    if owner is not None and not await store.find(PLANS_COLLECTION, {"root_id": root_of(plan)}, limit=1):
        # The trip's last version is gone: so are its members, votes and comments.
        await collab.delete_trip_data(store, root_of(plan))
        await store.delete(TRIPS_COLLECTION, root_of(plan))
    return Response(status_code=204)
