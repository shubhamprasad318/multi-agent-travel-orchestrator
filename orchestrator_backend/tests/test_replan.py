import pytest

from agents.itinerary_agent import DayDraft, SlotDraft
from agents.replan_agent import ReplanDraft
from orchestrator import PlanningError, create_plan, refine_plan, replan_day
from schemas import Meal
from tests.conftest import itinerary_draft, make_request


def rainy_day(keep_museum: bool = True) -> ReplanDraft:
    slots = [SlotDraft(period="afternoon", start_time="13:00", activity="Aquarium", location="Ikebukuro", cost=80, lat=35.72, lng=139.72)]
    if keep_museum:
        slots.insert(0, SlotDraft(period="morning", start_time="10:00", activity="Museum 2", location="Ueno", cost=50, lat=35.7148, lng=139.7736))
    return ReplanDraft(
        day=DayDraft(
            day=2,
            theme="Indoor day",
            slots=slots,
            meals=[Meal(type="lunch", suggestion="Tempura", cuisine="Japanese", cost=40)],
            backup_options=[],
            weather_note="Heavy rain all day",
        ),
        summary="Swapped the food walk for an aquarium.",
    )


async def test_replan_changes_only_that_day_and_keeps_ids(make_ctx):
    request = make_request()
    ctx, generator = make_ctx(request, ReplanDraft=rainy_day())
    plan = await create_plan(ctx, request)

    updated = await replan_day(ctx, plan, 2, "heavy rain forecast")

    before, after = plan.itinerary.days, updated.itinerary.days
    assert after[0] == before[0] and after[2] == before[2]
    assert [s.activity for s in after[1].slots] == ["Museum 2", "Aquarium"]
    # The stop that survived keeps its id (and so its votes and comments); new ones get new ids.
    assert after[1].slots[0].id == before[1].slots[0].id
    assert after[1].slots[1].id not in {s.id for d in before for s in d.slots}
    assert after[1].date == before[1].date and after[1].total_cost == 50 + 80 + 40
    assert updated.version == 2 and updated.parent_id == plan.id and updated.root_id == plan.id
    assert updated.refinements == ["Day 2 re-planned: heavy rain forecast"]
    assert [s.agent for s in updated.trace] == ["replan", "validator"]
    assert "Swapped the food walk" in updated.trace[0].detail
    prompt = [user for key, user in generator.calls if key == "replan_agent"][0]
    assert "heavy rain forecast" in prompt and "Food tour 2" in prompt and "Museum 1" in prompt


async def test_replan_unknown_day_is_rejected(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(request)
    plan = await create_plan(ctx, request)
    with pytest.raises(PlanningError) as info:
        await replan_day(ctx, plan, 9, "rain")
    assert info.value.status_code == 404


async def test_replan_failure_is_reported(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(request, ReplanDraft=RuntimeError("model down"))
    plan = await create_plan(ctx, request)
    with pytest.raises(PlanningError, match="re-plan day 1"):
        await replan_day(ctx, plan, 1, "rain")


async def test_refine_carries_over_ids_of_unchanged_stops(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(request, ItineraryDraft=[itinerary_draft(3), itinerary_draft(3, slot_cost=45)])
    plan = await create_plan(ctx, request)
    refined = await refine_plan(ctx, plan, "cheaper please")
    assert [s.id for d in refined.itinerary.days for s in d.slots] == [s.id for d in plan.itinerary.days for s in d.slots]
