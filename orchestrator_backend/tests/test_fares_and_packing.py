from datetime import timedelta

from agents import weather_agent
from agents.weather_agent import PackingItemDraft
from orchestrator import create_plan
from tests.conftest import START, default_responses, make_request
from utils.fares import Fare, parse_fares
from utils.store import MemoryStore


def _row(depart_offset: int, length: int, price: float, **extra):
    out = START + timedelta(days=depart_offset)
    return {
        "origin_airport": "SFO",
        "destination_airport": "HND",
        "price": price,
        "airline": "ZG",
        "transfers": 0,
        "duration_to": 660,
        "departure_at": f"{out.isoformat()}T10:00:00-07:00",
        "return_at": f"{(out + timedelta(days=length)).isoformat()}T18:00:00+09:00",
        "link": "/search/SFO1511HND21111?t=abc",
        **extra,
    }


def test_parse_fares_keeps_close_dates_cheapest_first():
    data = {
        "data": [
            _row(0, 2, 780),
            _row(1, 2, 650),
            _row(10, 2, 300),  # departs too far from the trip's start
            _row(0, 9, 300),  # trip length too different
            _row(0, 2, 0),  # no price
            {"price": "n/a"},
        ]
    }
    fares = parse_fares(data, START, START + timedelta(days=2), marker="12345")
    assert [f.price for f in fares] == [650, 780]
    assert fares[0].link == "https://www.aviasales.com/search/SFO1511HND21111?t=abc&marker=12345"
    assert fares[0].departure_at == (START + timedelta(days=1)).isoformat()


async def test_recent_fares_join_the_estimates(make_ctx):
    request = make_request()
    seen = []

    async def fares(origin, destination, depart, back):
        seen.append((origin, destination, depart, back))
        return [
            Fare(airline="ZG", origin_airport="SFO", destination_airport="NRT", price=700, transfers=1,
                 duration_minutes=725, departure_at=depart.isoformat(), return_at=back.isoformat(), link="https://www.aviasales.com/x")
        ]

    ctx, _ = make_ctx(request)
    ctx.fares = fares
    plan = await create_plan(ctx, request)

    # Looked up for the cheapest estimate's airports; merged cheapest-first.
    assert seen == [("SFO", "NRT", request.start_date, request.end_date)]
    first = plan.bookings.flights[0]
    assert (first.price_source, first.total_price, first.duration, first.stops) == ("recent_fare", 1400, "12h 05m", 1)
    assert [f.price_source for f in plan.bookings.flights[1:]] == ["estimate", "estimate"]
    assert (first.departure_at, first.search_url) == (request.start_date.isoformat(), "https://www.aviasales.com/x")
    assert plan.budget.flights == 1400


async def test_no_fares_means_estimates_only(make_ctx):
    request = make_request()

    async def no_fares(*_):
        return []

    ctx, _ = make_ctx(request)
    ctx.fares = no_fares
    plan = await create_plan(ctx, request)
    assert {f.price_source for f in plan.bookings.flights} == {"estimate"}
    assert len(plan.bookings.flights) == 2


async def test_packing_items_are_deduplicated_and_mirrored(make_ctx):
    request = make_request()
    draft = default_responses(request)["WeatherDraft"].model_copy(
        update={
            "packing_items": [
                PackingItemDraft(item="Umbrella", category="gear", reason="Rain on day 2"),
                PackingItemDraft(item="  umbrella ", category="gear", reason=""),
                PackingItemDraft(item="Passport", category="documents", reason=""),
            ]
        }
    )
    ctx, _ = make_ctx(request, WeatherDraft=draft)
    result = await weather_agent.run(ctx, request)
    assert [(i.item, i.category, i.reason) for i in result.packing_items] == [
        ("Umbrella", "gear", "Rain on day 2"),
        ("Passport", "documents", None),
    ]
    assert result.packing_list == ["Umbrella", "Passport"]


async def test_memory_store_find_matches_fields_lists_and_any_of():
    store = MemoryStore()
    await store.set("trips", "a", {"root_id": "a", "member_ids": ["u1", "u2"]})
    await store.set("trips", "b", {"root_id": "b", "member_ids": ["u2"]})
    await store.set("trips", "c", {"root_id": "c", "member_ids": []}, ttl=-1)
    assert [t["root_id"] for t in await store.find("trips", {"member_ids": "u2"})] == ["a", "b"]
    assert [t["root_id"] for t in await store.find("trips", {"member_ids": "u1"})] == ["a"]
    assert [t["root_id"] for t in await store.find("trips", {"root_id": ["b", "c", "z"]})] == ["b"]
    assert await store.find("trips", {"root_id": "a", "member_ids": "u3"}) == []
    assert len(await store.find("trips", {}, limit=1)) == 1
