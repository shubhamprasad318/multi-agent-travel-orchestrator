"""LangGraph workflow that runs the agents and assembles a `TravelPlan`.

    START ─┬─> research ─┬─> activity ──┐
           │             └─> booking ───┼─> itinerary ─> validator ─┬─> END
           └─> weather ─────────────────┘                ▲          │
                                                         └─ revision <┘ (score too low, once)

Each agent run is wrapped by `_run_step`, which records a `TraceStep` (timing,
tokens, sources, outcome) and turns a failure into an `AgentError` so the rest
of the plan still gets built.
"""

import asyncio
import operator
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Awaitable, Callable, TypedDict

from langgraph.graph import END, START, StateGraph

from agents import activity_agent, booking_agent, itinerary_agent, research_agent, validator_agent, weather_agent
from agents.base import AgentContext, LLMUnavailableError, StepUsage, current_step
from config import VALIDATION_CONFIG
from schemas import (
    ActivitiesResult,
    AgentError,
    AgentName,
    BookingsResult,
    BudgetBreakdown,
    Itinerary,
    ResearchResult,
    TraceStep,
    TravelPlan,
    TravelRequest,
    TripSummary,
    Validation,
    WeatherResult,
)
from utils.budget import compute_budget
from utils.logger import get_logger

logger = get_logger(__name__)


class PlanState(TypedDict, total=False):
    request: TravelRequest
    research: ResearchResult | None
    weather: WeatherResult | None
    activities: ActivitiesResult | None
    bookings: BookingsResult | None
    itinerary: Itinerary | None
    validation: Validation | None
    budget: BudgetBreakdown | None
    revisions: int
    # Best version seen so far, restored if a revision scores worse.
    previous_itinerary: Itinerary | None
    previous_validation: Validation | None
    errors: Annotated[list[AgentError], operator.add]
    trace: Annotated[list[TraceStep], operator.add]


class PlanningError(RuntimeError):
    """The plan could not be produced at all (as opposed to partially)."""


WEATHER_DETAIL = {
    "forecast": "Live forecast for every day",
    "mixed": "Live forecast for the first days, typical conditions after",
    "climate_estimate": "Typical conditions (trip is beyond the forecast horizon)",
}


def _elapsed_ms(ctx: AgentContext, since: float | None = None) -> int:
    return round(((since or time.perf_counter()) - ctx.started_at) * 1000)


async def _run_step(
    ctx: AgentContext, agent: AgentName, fn: Callable[[], Awaitable[dict[str, Any]]]
) -> tuple[dict[str, Any] | None, TraceStep, Exception | None]:
    """Run one agent, recording usage and emitting progress events.

    `fn` may include a `_detail` key in its result: a one-line summary shown in
    the trace view. It is removed before the result is merged into state.
    """
    usage = StepUsage()
    token = current_step.set(usage)
    started = time.perf_counter()
    await ctx.emit({"type": "progress", "agent": agent, "status": "started", "started_ms": _elapsed_ms(ctx, started)})
    update: dict[str, Any] | None = None
    error: Exception | None = None
    try:
        update = await fn()
    except LLMUnavailableError as exc:
        # Expected operational failure: one line, no traceback.
        logger.warning("%s agent failed: %s", agent, exc)
        error = exc
    except Exception as exc:  # noqa: BLE001 - one agent failing must not sink the plan
        logger.exception("%s agent failed", agent)
        error = exc
    finally:
        current_step.reset(token)

    detail = update.pop("_detail", None) if update else None
    if error is not None:
        detail = _error(ctx, agent, error).message
    step = TraceStep(
        agent=agent,
        status="failed" if error else "completed",
        started_ms=_elapsed_ms(ctx, started),
        duration_ms=round((time.perf_counter() - started) * 1000),
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        llm_calls=usage.llm_calls,
        grounded=usage.grounded,
        sources=usage.sources,
        detail=detail,
    )
    await ctx.emit({"type": "progress", "agent": agent, "status": step.status, "step": step.model_dump()})
    return update, step, error


def _error(ctx: AgentContext, agent: AgentName, exc: Exception) -> AgentError:
    if isinstance(exc, LLMUnavailableError):
        # Written for users and contains no internals, so always shown.
        return AgentError(agent=agent, message=str(exc), retryable=True)
    message = f"{type(exc).__name__}: {exc}" if ctx.settings.debug else "This step failed; its section is missing."
    return AgentError(agent=agent, message=message)


NodeFn = Callable[[PlanState], Awaitable[dict[str, Any]]]


def _node(ctx: AgentContext, agent: AgentName, output_key: str, fn: NodeFn) -> NodeFn:
    async def wrapped(state: PlanState) -> dict[str, Any]:
        update, step, error = await _run_step(ctx, agent, lambda: fn(state))
        if error is not None:
            return {output_key: state.get(output_key), "errors": [_error(ctx, agent, error)], "trace": [step]}
        return {**(update or {}), "trace": [step]}

    return wrapped


def _should_revise(state: dict[str, Any]) -> bool:
    validation = state.get("validation")
    return (
        validation is not None
        and state.get("itinerary") is not None
        and state.get("previous_validation") is None
        and validation.overall_score < VALIDATION_CONFIG["revision_threshold"]
        and state.get("revisions", 0) < VALIDATION_CONFIG["max_revisions"]
    )


def build_graph(ctx: AgentContext):
    async def research(state: PlanState) -> dict[str, Any]:
        result = await research_agent.run(ctx, state["request"])
        return {
            "research": result,
            "_detail": f"{len(result.highlights)} highlights, {len(result.neighborhoods)} areas to stay, {len(result.sources)} sources",
        }

    async def weather(state: PlanState) -> dict[str, Any]:
        result = await weather_agent.run(ctx, state["request"])
        return {"weather": result, "_detail": WEATHER_DETAIL[result.source]}

    async def activity(state: PlanState) -> dict[str, Any]:
        result = await activity_agent.run(ctx, state["request"], state.get("research"))
        categories = len({a.category for a in result.activities})
        return {"activities": result, "_detail": f"{len(result.activities)} activities across {categories} categories"}

    async def booking(state: PlanState) -> dict[str, Any]:
        result = await booking_agent.run(ctx, state["request"], state.get("research"))
        return {"bookings": result, "_detail": f"{len(result.flights)} flight options, {len(result.hotels)} hotels"}

    async def itinerary(state: PlanState) -> dict[str, Any]:
        result = await itinerary_agent.run(
            ctx,
            state["request"],
            state.get("research"),
            state.get("weather"),
            state.get("activities"),
            state.get("bookings"),
        )
        stops = sum(len(d.slots) for d in result.days)
        spend = sum(d.total_cost for d in result.days)
        return {"itinerary": result, "_detail": f"{len(result.days)} days, {stops} stops, ${spend:,.0f} on the ground"}

    async def validator(state: PlanState) -> dict[str, Any]:
        request = state["request"]
        budget = compute_budget(request, state.get("bookings"), state.get("itinerary"))
        validation = await validator_agent.run(
            ctx,
            request,
            state.get("itinerary"),
            state.get("weather"),
            state.get("activities"),
            state.get("bookings"),
            budget,
        )
        score = f"Score {validation.overall_score}/100 ({validation.status})"
        previous = state.get("previous_validation")
        if previous and validation.overall_score < previous.overall_score:
            itinerary_kept = state.get("previous_itinerary")
            return {
                "itinerary": itinerary_kept,
                "validation": previous,
                "budget": compute_budget(request, state.get("bookings"), itinerary_kept),
                "_detail": f"Revision scored {validation.overall_score}, lower than {previous.overall_score}: kept the original",
            }
        if previous:
            detail = f"{score}: revision improved it from {previous.overall_score}"
        elif _should_revise({**state, "validation": validation}):
            detail = f"{score}: below {VALIDATION_CONFIG['revision_threshold']}, sending back for revision"
        else:
            detail = score
        return {"validation": validation, "budget": budget, "_detail": detail}

    async def revision(state: PlanState) -> dict[str, Any]:
        current, feedback = state.get("itinerary"), state.get("validation")
        revised = await itinerary_agent.run(
            ctx,
            state["request"],
            state.get("research"),
            state.get("weather"),
            state.get("activities"),
            state.get("bookings"),
            previous=current,
            feedback=feedback,
        )
        return {
            "itinerary": revised,
            "previous_itinerary": current,
            "previous_validation": feedback,
            "_detail": f"Rewrote the itinerary to address {len(feedback.issues) if feedback else 0} issues",
        }

    async def count_revision(state: PlanState) -> dict[str, Any]:
        # Counted separately so the retry budget is spent even if revision fails.
        return {"revisions": state.get("revisions", 0) + 1}

    def after_validation(state: PlanState) -> str:
        return "count_revision" if _should_revise(state) else END

    graph = StateGraph(PlanState)
    graph.add_node("research", _node(ctx, "research", "research", research))
    graph.add_node("weather", _node(ctx, "weather", "weather", weather))
    graph.add_node("activity", _node(ctx, "activity", "activities", activity))
    graph.add_node("booking", _node(ctx, "booking", "bookings", booking))
    graph.add_node("itinerary", _node(ctx, "itinerary", "itinerary", itinerary))
    graph.add_node("validator", _node(ctx, "validator", "validation", validator))
    graph.add_node("count_revision", count_revision)
    graph.add_node("revision", _node(ctx, "revision", "itinerary", revision))

    graph.add_edge(START, "research")
    graph.add_edge(START, "weather")
    graph.add_edge("research", "activity")
    graph.add_edge("research", "booking")
    graph.add_edge(["activity", "booking", "weather"], "itinerary")
    graph.add_edge("itinerary", "validator")
    graph.add_conditional_edges("validator", after_validation, ["count_revision", END])
    graph.add_edge("count_revision", "revision")
    graph.add_edge("revision", "validator")
    return graph.compile()


async def create_plan(ctx: AgentContext, request: TravelRequest) -> TravelPlan:
    ctx.started_at = time.perf_counter()
    graph = build_graph(ctx)
    try:
        state: PlanState = await asyncio.wait_for(
            graph.ainvoke({"request": request, "errors": [], "trace": [], "revisions": 0}),
            timeout=ctx.settings.plan_timeout_seconds,
        )
    except TimeoutError as exc:
        raise PlanningError("Planning took too long. Please try again.") from exc

    itinerary = state.get("itinerary")
    errors = state.get("errors", [])
    if itinerary is None:
        cause = next((e for e in errors if e.agent == "itinerary" and e.retryable), None)
        raise PlanningError(cause.message if cause else "We couldn't generate an itinerary for this trip. Please try again.")

    validation = state.get("validation")
    if validation is not None:
        validation = validation.model_copy(update={"revisions": state.get("revisions", 0)})

    return TravelPlan(
        id=uuid.uuid4().hex,
        status="partial" if errors else "complete",
        created_at=datetime.now(timezone.utc),
        request=request,
        trip=TripSummary(
            destination=request.destination,
            origin=request.origin,
            start_date=request.start_date,
            end_date=request.end_date,
            days=request.days,
            nights=request.nights,
            travelers=request.travelers,
        ),
        research=state.get("research"),
        weather=state.get("weather"),
        activities=state.get("activities"),
        bookings=state.get("bookings"),
        itinerary=itinerary,
        # Always recomputed from the final itinerary/bookings.
        budget=compute_budget(request, state.get("bookings"), itinerary),
        validation=validation,
        errors=errors,
        trace=state.get("trace", []),
    )


async def refine_plan(ctx: AgentContext, plan: TravelPlan, instruction: str) -> TravelPlan:
    """Apply a traveller's change request to an existing plan.

    Only the itinerary and validation are regenerated; research, weather,
    activities and bookings are reused. The result is a new plan version.
    """
    request = plan.request
    ctx.started_at = time.perf_counter()

    async def replan() -> dict[str, Any]:
        itinerary = await itinerary_agent.run(
            ctx,
            request,
            plan.research,
            plan.weather,
            plan.activities,
            plan.bookings,
            previous=plan.itinerary,
            instruction=instruction,
        )
        return {"itinerary": itinerary, "_detail": f"Applied change: {instruction}"}

    async def run() -> TravelPlan:
        update, itinerary_step, error = await _run_step(ctx, "itinerary", replan)
        if error is not None or update is None:
            if isinstance(error, LLMUnavailableError):
                raise PlanningError(str(error))
            raise PlanningError("We couldn't apply that change. Try rephrasing it.")
        itinerary: Itinerary = update["itinerary"]
        budget = compute_budget(request, plan.bookings, itinerary)
        errors = [e for e in plan.errors if e.agent != "validator"]

        async def validate() -> dict[str, Any]:
            result = await validator_agent.run(
                ctx, request, itinerary, plan.weather, plan.activities, plan.bookings, budget
            )
            before = plan.validation.overall_score if plan.validation else None
            change = f" (was {before})" if before is not None else ""
            return {"validation": result, "_detail": f"Score {result.overall_score}/100{change}"}

        validated, validator_step, validator_error = await _run_step(ctx, "validator", validate)
        if validator_error is not None:
            errors.append(_error(ctx, "validator", validator_error))
        return plan.model_copy(
            update={
                "id": uuid.uuid4().hex,
                "created_at": datetime.now(timezone.utc),
                "itinerary": itinerary,
                "budget": budget,
                "validation": validated["validation"] if validated else None,
                "errors": errors,
                "status": "partial" if errors else "complete",
                "trace": [itinerary_step, validator_step],
                "version": plan.version + 1,
                "parent_id": plan.id,
                "refinements": [*plan.refinements, instruction],
            }
        )

    try:
        return await asyncio.wait_for(run(), timeout=ctx.settings.plan_timeout_seconds)
    except TimeoutError as exc:
        raise PlanningError("Refining took too long. Please try again.") from exc
    except PlanningError:
        raise
    except Exception as exc:
        logger.exception("refinement failed")
        raise PlanningError("We couldn't apply that change. Try rephrasing it.") from exc
