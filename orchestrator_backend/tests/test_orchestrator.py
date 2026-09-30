from datetime import timedelta

import pytest

from agents.validator_agent import ValidatorDraft
from orchestrator import PlanningError, create_plan
from tests.conftest import itinerary_draft, make_request


async def test_full_plan_is_complete_and_consistent(make_ctx):
    request = make_request()
    ctx, generator = make_ctx(request)

    plan = await create_plan(ctx, request)

    assert plan.status == "complete"
    assert plan.errors == []
    assert plan.trip.days == 3 and plan.trip.nights == 2
    # Dates are assigned by code, not the model.
    assert [d.date for d in plan.itinerary.days] == [request.start_date + timedelta(days=i) for i in range(3)]
    assert plan.itinerary.days[0].total_cost == 130
    # Cheapest flight first, priced for the whole group.
    assert plan.bookings.flights[0].airline == "JAL"
    assert plan.bookings.flights[0].total_price == 1800
    assert plan.bookings.flights[0].search_url.startswith("https://www.google.com/travel/flights?q=")
    # 2 travellers -> 1 room x 2 nights.
    assert plan.bookings.hotels[0].total_price == 300
    assert plan.bookings.hotels[0].search_url.startswith("https://www.booking.com/searchresults.html?")
    assert plan.budget.estimated_total == 1800 + 300 + 3 * 130
    assert plan.budget.status == "Within Budget"
    assert plan.validation.status == "Approved"
    assert plan.validation.category_scores["budget_feasibility"] == 100
    assert plan.weather.source == "climate_estimate"
    assert plan.research.sources[0].url == "https://example.com/guide"
    assert len(plan.weather.days) == 3
    assert {call[0] for call in generator.calls} == {
        "research_agent", "weather_agent", "activity_agent", "booking_agent", "itinerary_agent", "validator_agent",
    }


async def test_itinerary_is_told_the_budget_left_after_flights_and_lodging(make_ctx):
    request = make_request()
    ctx, generator = make_ctx(request)
    await create_plan(ctx, request)
    itinerary_prompt = next(user for key, user in generator.calls if key == "itinerary_agent")
    assert "$2,900" in itinerary_prompt  # 5000 - 1800 - 300


async def test_no_origin_means_no_flights(make_ctx):
    request = make_request(origin="  ")
    ctx, _ = make_ctx(request)
    plan = await create_plan(ctx, request)
    assert request.origin is None
    assert plan.bookings.flights == []
    assert "departure city" in plan.bookings.notes[0]


async def test_failed_agent_produces_partial_plan(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(request, ResearchDraft=RuntimeError("boom"))
    plan = await create_plan(ctx, request)
    assert plan.status == "partial"
    assert plan.research is None
    assert [e.agent for e in plan.errors] == ["research"]
    # Error details are hidden unless DEBUG is on.
    assert "boom" not in plan.errors[0].message
    assert plan.itinerary is not None


async def test_itinerary_failure_is_fatal(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(request, ItineraryDraft=RuntimeError("model down"))
    with pytest.raises(PlanningError):
        await create_plan(ctx, request)


def _scores(value: int) -> ValidatorDraft:
    return ValidatorDraft(
        itinerary_quality=value,
        weather_suitability=value,
        activity_diversity=value,
        booking_availability=value,
        overall_coherence=value,
        issues=["Too rushed"],
        recommendations=["Slow down"],
    )


async def test_low_score_triggers_one_revision(make_ctx):
    request = make_request()
    ctx, generator = make_ctx(
        request,
        ValidatorDraft=[_scores(20), _scores(90)],
        ItineraryDraft=[itinerary_draft(3), itinerary_draft(3, slot_cost=40)],
    )
    plan = await create_plan(ctx, request)
    assert plan.validation.revisions == 1
    assert plan.validation.status == "Approved"
    assert plan.itinerary.days[0].slots[0].cost == 40
    revision_prompt = [user for key, user in generator.calls if key == "itinerary_agent"][1]
    assert "Too rushed" in revision_prompt


async def test_worse_revision_is_discarded(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(
        request,
        ValidatorDraft=[_scores(30), _scores(10)],
        ItineraryDraft=[itinerary_draft(3), itinerary_draft(3, slot_cost=40)],
    )
    plan = await create_plan(ctx, request)
    assert plan.validation.revisions == 1
    assert plan.itinerary.days[0].slots[0].cost == 50
    assert plan.validation.overall_score < 60


async def test_over_budget_is_flagged(make_ctx):
    request = make_request(budget=2000)
    ctx, _ = make_ctx(request)
    plan = await create_plan(ctx, request)
    assert plan.budget.status == "Over Budget"
    assert plan.budget.remaining < 0
    assert plan.validation.category_scores["budget_feasibility"] < 100
    assert any("vs the budget" in issue for issue in plan.validation.issues)


async def test_progress_events_are_emitted(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(request)
    events = []

    async def emit(event):
        events.append(event)

    ctx.emit = emit
    await create_plan(ctx, request)
    completed = [e["agent"] for e in events if e["status"] == "completed"]
    assert set(completed) == {"research", "weather", "activity", "booking", "itinerary", "validator"}
    assert completed.index("itinerary") > completed.index("booking")


async def test_trace_records_every_step_with_usage(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(request)
    plan = await create_plan(ctx, request)

    by_agent = {step.agent: step for step in plan.trace}
    assert set(by_agent) == {"research", "weather", "activity", "booking", "itinerary", "validator"}
    assert all(step.status == "completed" and step.llm_calls == 1 for step in plan.trace)
    assert by_agent["research"].grounded and by_agent["research"].sources == 1
    assert by_agent["itinerary"].input_tokens == 100 and not by_agent["itinerary"].grounded
    # Itinerary can only start after booking has finished.
    assert by_agent["itinerary"].started_ms >= by_agent["booking"].started_ms
    assert "Score" in by_agent["validator"].detail


async def test_trace_tells_the_revision_story(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(
        request,
        ValidatorDraft=[_scores(20), _scores(90)],
        ItineraryDraft=[itinerary_draft(3), itinerary_draft(3)],
    )
    plan = await create_plan(ctx, request)
    details = [(s.agent, s.detail) for s in plan.trace if s.agent in ("validator", "revision")]
    assert [agent for agent, _ in details] == ["validator", "revision", "validator"]
    assert "sending back for revision" in details[0][1]
    assert "improved it from 36" in details[2][1]  # 20s from the model + 100 budget score


async def test_failed_step_is_traced(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(request, ActivitiesDraft=RuntimeError("boom"))
    plan = await create_plan(ctx, request)
    failed = [s for s in plan.trace if s.status == "failed"]
    assert [s.agent for s in failed] == ["activity"]
    assert "boom" not in failed[0].detail


async def test_implausible_coordinates_are_dropped(make_ctx):
    request = make_request()
    draft = itinerary_draft(3)
    draft.days[0].slots[0].lat, draft.days[0].slots[0].lng = 0.0, 0.0
    draft.days[1].slots[0].lat, draft.days[1].slots[0].lng = 48.85, 2.35  # Paris, not Tokyo
    ctx, _ = make_ctx(request, ItineraryDraft=draft)
    plan = await create_plan(ctx, request)
    days = plan.itinerary.days
    assert days[0].slots[0].lat is None
    assert days[1].slots[0].lat is None
    assert days[0].slots[1].lat == 35.6938
