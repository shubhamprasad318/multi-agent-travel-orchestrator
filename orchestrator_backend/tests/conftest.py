from datetime import date, timedelta
from typing import Any, Callable

import pytest

from agents.activity_agent import ActivitiesDraft
from agents.base import AgentContext, record_usage
from agents.booking_agent import BookingDraft, FlightDraft, HotelDraft
from agents.itinerary_agent import DayDraft, ItineraryDraft, SlotDraft
from agents.research_agent import ResearchDraft
from agents.validator_agent import ValidatorDraft
from agents.weather_agent import DayDraft as WeatherDayDraft, PackingItemDraft, WeatherDraft
from config import Settings
from schemas import Activity, Meal, Neighborhood, Source, TravelRequest
from utils.store import MemoryStore

START = date.today() + timedelta(days=60)

# Units per 1 USD, as returned by utils.fx.fetch_rates.
FAKE_RATES = {"USD": 1.0, "INR": 80.0, "JPY": 150.0, "EUR": 0.9}


async def fake_fx() -> tuple[dict[str, float], str | None]:
    return FAKE_RATES, "test-date"


def make_request(**overrides: Any) -> TravelRequest:
    data: dict[str, Any] = {
        "destination": "Tokyo, Japan",
        "origin": "San Francisco",
        "start_date": START,
        "end_date": START + timedelta(days=2),
        "budget": 5000,
        "travelers": 2,
        "preferences": {"interests": ["Food", "culture"], "pace": "moderate", "accommodation": "mid-range"},
    }
    data.update(overrides)
    return TravelRequest.model_validate(data)


def itinerary_draft(days: int, slot_cost: float = 50, meal_cost: float = 30) -> ItineraryDraft:
    return ItineraryDraft(
        days=[
            DayDraft(
                day=n,
                theme=f"Theme {n}",
                slots=[
                    SlotDraft(period="morning", start_time="09:00", activity=f"Museum {n}", location="Ueno", cost=slot_cost, lat=35.7148, lng=139.7736),
                    SlotDraft(period="evening", start_time="19:00", activity=f"Food tour {n}", location="Shinjuku", cost=slot_cost, lat=35.6938, lng=139.7034),
                ],
                meals=[Meal(type="lunch", suggestion="Ramen", cuisine="Japanese", cost=meal_cost)],
                backup_options=["teamLab"],
                weather_note="",
            )
            for n in range(1, days + 1)
        ],
        highlights=["Sushi"],
        tips=["Get a Suica card"],
    )


def default_responses(request: TravelRequest) -> dict[str, Any]:
    return {
        "ResearchDraft": ResearchDraft(
            overview="Big city.",
            highlights=["Senso-ji"],
            neighborhoods=[Neighborhood(name="Shinjuku", description="Busy", good_for="nightlife")],
            cultural_tips=["Bow"],
            safety_tips=["Very safe"],
            getting_around="Metro",
            best_time_to_visit="Spring",
            local_currency="jpy",
        ),
        "WeatherDraft": WeatherDraft(
            summary="Mild.",
            days=[
                WeatherDayDraft(
                    date=(request.start_date + timedelta(days=i)).isoformat(),
                    condition="Sunny",
                    temp_min_c=10,
                    temp_max_c=20,
                    precip_chance=10,
                    is_forecast=False,
                )
                for i in range(request.days)
            ],
            packing_items=[PackingItemDraft(item="Umbrella", category="gear", reason="Showers are common")],
            advisories=[],
        ),
        "ActivitiesDraft": ActivitiesDraft(
            activities=[
                Activity(
                    name="Tsukiji Outer Market",
                    category="food",
                    description="Street food",
                    estimated_cost=40,
                    duration="2h",
                    best_time="Morning",
                    location="Tsukiji",
                )
            ]
        ),
        "BookingDraft": BookingDraft(
            flights=[
                FlightDraft(airline="ANA", departure_airport="SFO", arrival_airport="HND", stops=0, duration="11h", price_per_person=1200),
                FlightDraft(airline="JAL", departure_airport="SFO", arrival_airport="NRT", stops=0, duration="11h", price_per_person=900),
            ],
            hotels=[HotelDraft(name="Hotel Gracery", area="Shinjuku", type="Hotel", rating=4.2, price_per_night=150, amenities=["Wi-Fi"])],
            notes=[],
        ),
        "ItineraryDraft": itinerary_draft(request.days),
        "ValidatorDraft": ValidatorDraft(
            itinerary_quality=85,
            weather_suitability=80,
            activity_diversity=80,
            booking_availability=90,
            overall_coherence=85,
            issues=[],
            recommendations=["Book early"],
        ),
    }


class FakeGenerator:
    """Returns canned drafts keyed by schema name; values may be callables or exceptions."""

    def __init__(self, responses: dict[str, Any]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, str]] = []

    async def __call__(
        self, agent_key: str, schema: type, system: str, user: str, *, grounded: bool = False, sources: list | None = None
    ) -> Any:
        self.calls.append((agent_key, user))
        if grounded and sources is not None:
            sources.append(Source(title="Example guide", url="https://example.com/guide"))
        record_usage(input_tokens=100, output_tokens=50, grounded=grounded, sources=1 if grounded else 0)
        response = self.responses[schema.__name__]
        if isinstance(response, list):
            response = response.pop(0) if len(response) > 1 else response[0]
        if isinstance(response, Exception):
            raise response
        if isinstance(response, Callable) and not hasattr(response, "model_dump"):
            return response(user)
        return response


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None, google_api_key="test", rate_limit_per_minute=100)


@pytest.fixture
def make_ctx(settings: Settings) -> Callable[..., tuple[AgentContext, FakeGenerator]]:
    def factory(request: TravelRequest, **overrides: Any) -> tuple[AgentContext, FakeGenerator]:
        responses = default_responses(request)
        responses.update(overrides)
        generator = FakeGenerator(responses)
        return AgentContext(settings=settings, store=MemoryStore(), generate=generator, fx=fake_fx), generator

    return factory
