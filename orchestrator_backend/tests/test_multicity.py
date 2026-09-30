from datetime import timedelta

import pytest
from pydantic import ValidationError

from agents.activity_agent import ActivitiesDraft
from agents.booking_agent import BookingDraft, FlightDraft, HotelDraft, TransferDraft
from agents.itinerary_agent import DayDraft, ItineraryDraft, SlotDraft
from orchestrator import create_plan
from schemas import Activity, Meal, TravelRequest
from tests.conftest import START, make_request

TOKYO = (35.68, 139.76)
KYOTO = (35.01, 135.77)  # ~370 km from Tokyo: one city's centre must not drop the other's stops


def multicity_request(**overrides):
    return make_request(
        stops=[{"destination": "Tokyo, Japan", "nights": 2}, {"destination": "Kyoto, Japan", "nights": 2}],
        end_date=START + timedelta(days=4),
        **overrides,
    )


def city_itinerary(days: int) -> ItineraryDraft:
    def coords(n: int) -> tuple[float, float]:
        return TOKYO if n <= 2 else KYOTO

    return ItineraryDraft(
        days=[
            DayDraft(
                day=n,
                theme=f"Theme {n}",
                slots=[
                    SlotDraft(period="morning", start_time="09:00", activity=f"Temple {n}", location="Somewhere", cost=40, lat=coords(n)[0], lng=coords(n)[1]),
                ],
                meals=[Meal(type="lunch", suggestion="Noodles", cuisine="Japanese", cost=20)],
                backup_options=[],
                weather_note="",
            )
            for n in range(1, days + 1)
        ],
        highlights=[],
        tips=[],
    )


def multicity_overrides():
    return {
        "BookingDraft": BookingDraft(
            flights=[FlightDraft(airline="JAL", departure_airport="SFO", arrival_airport="HND", stops=0, duration="11h", price_per_person=900)],
            hotels=[
                HotelDraft(name="Kyoto Inn", area="Gion", type="Ryokan", rating=4.5, price_per_night=200, amenities=[], city="Kyoto"),
                HotelDraft(name="Tokyo Stay", area="Shinjuku", type="Hotel", rating=4.1, price_per_night=150, amenities=[], city="tokyo, japan"),
                HotelDraft(name="Tokyo Backup", area="Ueno", type="Hotel", rating=3.9, price_per_night=90, amenities=[], city="Tokyo"),
            ],
            notes=[],
            transfers=[TransferDraft(from_city="Tokyo", to_city="Kyoto", mode="Train", duration="2h 15m", price_per_person=100, notes="Shinkansen")],
        ),
        "ActivitiesDraft": ActivitiesDraft(
            activities=[
                Activity(name="Fushimi Inari", category="culture", description="Gates", estimated_cost=0, duration="2h", best_time="Morning", location="Fushimi", city="Kyoto, Japan"),
                Activity(name="Tsukiji", category="food", description="Market", estimated_cost=60, duration="2h", best_time="Morning", location="Tsukiji", city="Osaka"),
            ]
        ),
        "ItineraryDraft": city_itinerary(5),
    }


def test_stops_must_add_up_to_the_trip_nights():
    with pytest.raises(ValidationError, match="add up"):
        make_request(stops=[{"destination": "Tokyo", "nights": 1}, {"destination": "Kyoto", "nights": 1}], end_date=START + timedelta(days=4))


def test_route_becomes_the_destination_and_days_map_to_cities():
    request = multicity_request()
    assert request.destination == "Tokyo, Japan → Kyoto, Japan"
    # Days 1-2 in Tokyo; the move day (day 3) and after in Kyoto; the last day stays in Kyoto.
    assert request.day_cities() == ["Tokyo, Japan", "Tokyo, Japan", "Kyoto, Japan", "Kyoto, Japan", "Kyoto, Japan"]
    (_, tokyo_in, tokyo_out), (_, kyoto_in, kyoto_out) = request.stop_dates()
    assert (tokyo_in, tokyo_out, kyoto_in, kyoto_out) == (START, START + timedelta(days=2), START + timedelta(days=2), START + timedelta(days=4))


def test_a_route_needs_no_separate_destination():
    request = TravelRequest.model_validate(
        {
            "stops": [{"destination": " Lisbon ", "nights": 1}, {"destination": "Porto", "nights": 1}],
            "start_date": START,
            "end_date": START + timedelta(days=2),
            "budget": 2000,
            "travelers": 1,
        }
    )
    assert request.destination == "Lisbon → Porto"
    with pytest.raises(ValidationError, match="destination is required"):
        TravelRequest.model_validate({"start_date": START, "end_date": START, "budget": 100, "travelers": 1})


def test_a_single_stop_is_a_normal_trip():
    request = make_request(stops=[{"destination": "Lisbon", "nights": 2}])
    assert request.stops == [] and request.destination == "Lisbon"


async def test_multicity_plan_has_cities_hotels_per_city_and_transfers(make_ctx):
    request = multicity_request()
    ctx, generator = make_ctx(request, **multicity_overrides())

    plan = await create_plan(ctx, request)

    assert [d.city for d in plan.itinerary.days] == request.day_cities()
    assert plan.trip.stops == request.stops
    # Hotels are grouped per city in route order, matched even when the model renames the city.
    hotels = plan.bookings.hotels
    assert [(h.name, h.city, h.nights) for h in hotels] == [
        ("Tokyo Stay", "Tokyo, Japan", 2),
        ("Tokyo Backup", "Tokyo, Japan", 2),
        ("Kyoto Inn", "Kyoto, Japan", 2),
    ]
    assert "checkin=" + (START + timedelta(days=2)).isoformat() in hotels[2].search_url
    (transfer,) = plan.bookings.transfers
    assert (transfer.from_city, transfer.to_city, transfer.date, transfer.mode) == ("Tokyo, Japan", "Kyoto, Japan", START + timedelta(days=2), "train")
    assert transfer.cost == 200  # 2 travellers
    # One hotel per city is budgeted, plus the transfer.
    assert plan.budget.lodging == 150 * 2 + 200 * 2
    assert plan.budget.transfers == 200
    assert plan.budget.estimated_total == 1800 + 700 + 200 + 5 * 60
    # Activities in a city not on the route are kept but not attributed to one.
    assert [a.city for a in plan.activities.activities] == ["Kyoto, Japan", None]
    # Coordinates are checked per city, so Kyoto's stops survive next to Tokyo's.
    assert all(s.lat is not None for d in plan.itinerary.days for s in d.slots)

    prompts = dict(generator.calls)
    assert "Multi-city trip" in prompts["research_agent"]
    assert "Day 3 (" in prompts["itinerary_agent"] and "travel day: train from Tokyo, Japan" in prompts["itinerary_agent"]
    assert "(Kyoto, Japan)" in prompts["weather_agent"]
    assert plan.weather.days[0].location == "Tokyo, Japan"
    assert "flights?q=" in plan.bookings.flights[0].search_url and "returning+from+Kyoto" in plan.bookings.flights[0].search_url


async def test_single_city_plan_is_unchanged(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(request)
    plan = await create_plan(ctx, request)
    assert plan.bookings.transfers == [] and plan.budget.transfers == 0
    assert all(d.city is None for d in plan.itinerary.days)
    assert plan.root_id == plan.id and plan.owner_id is None
    # Every stop has its own id.
    ids = [s.id for d in plan.itinerary.days for s in d.slots]
    assert len(ids) == len(set(ids))
