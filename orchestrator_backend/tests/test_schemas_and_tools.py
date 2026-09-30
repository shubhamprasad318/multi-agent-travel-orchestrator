from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from agents import weather_agent
from agents.weather_agent import DayDraft as WeatherDayDraft, PackingItemDraft, WeatherDraft
from tests.conftest import START, make_request
from utils.store import MemoryStore


def test_interests_are_normalized_and_duration_is_ignored():
    request = make_request(duration=99, preferences={"interests": [" Food ", "food", "", "Art"]})
    assert request.preferences.interests == ["food", "art"]
    assert request.days == 3


@pytest.mark.parametrize(
    "overrides",
    [
        {"end_date": START - timedelta(days=1)},
        {"start_date": date.today() - timedelta(days=5), "end_date": date.today()},
        {"end_date": START + timedelta(days=40)},
        {"travelers": 0},
        {"budget": 0},
        {"destination": " "},
        {"preferences": {"pace": "fast-paced"}},
    ],
)
def test_invalid_requests_are_rejected(overrides):
    with pytest.raises(ValidationError):
        make_request(**overrides)


def test_rooms_round_up():
    assert make_request(travelers=1).rooms == 1
    assert make_request(travelers=3).rooms == 2


async def test_memory_store_expires_entries():
    store = MemoryStore()
    await store.set("c", "k", {"v": 1}, ttl=-1)
    assert await store.get("c", "k") is None
    await store.set("c", "k", {"v": 2})
    assert await store.get("c", "k") == {"v": 2}


def _weather_draft(request, forecast_days: int):
    return WeatherDraft(
        summary="Mild.",
        days=[
            WeatherDayDraft(
                date=(request.start_date + timedelta(days=i)).isoformat(),
                condition="Rain" if i < forecast_days else "Sunny",
                temp_min_c=5,
                temp_max_c=15,
                precip_chance=150,
                is_forecast=i < forecast_days,
            )
            for i in range(request.days)
        ]
        + [WeatherDayDraft(date="not-a-date", condition="x", temp_min_c=0, temp_max_c=0, precip_chance=0, is_forecast=False)],
        packing_items=[PackingItemDraft(item="Umbrella", category="gear", reason="Showers are common")],
        advisories=[],
    )


async def test_weather_near_trip_is_grounded_and_mixed(make_ctx):
    today = date.today()
    request = make_request(start_date=today + timedelta(days=2), end_date=today + timedelta(days=4))
    ctx, generator = make_ctx(request, WeatherDraft=_weather_draft(request, forecast_days=1))

    result = await weather_agent.run(ctx, request, today=today)

    assert result.source == "mixed"
    assert [d.date for d in result.days] == [request.start_date + timedelta(days=i) for i in range(3)]
    assert result.days[0].precip_chance == 100  # clamped
    assert "search for the latest forecast" in generator.calls[0][1]


async def test_distant_trip_never_claims_a_forecast(make_ctx):
    request = make_request()  # starts 60 days out
    ctx, generator = make_ctx(request, WeatherDraft=_weather_draft(request, forecast_days=3))

    result = await weather_agent.run(ctx, request)

    assert result.source == "climate_estimate"
    assert "climate averages only" in generator.calls[0][1]


def test_plausible_points_uses_a_robust_centre():
    from utils.geo import plausible_points

    tokyo = [(35.68, 139.76), (35.71, 139.79), (35.66, 139.70), (35.36, 138.73)]  # last: Mt Fuji day trip
    assert plausible_points(tokyo + [(40.71, -74.0), (0.0, 0.0), (95.0, 10.0)]) == [True] * 4 + [False] * 3
