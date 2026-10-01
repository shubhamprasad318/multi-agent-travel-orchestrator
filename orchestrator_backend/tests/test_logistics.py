"""Travel-time and meal checks the validator runs in code."""

from datetime import timedelta

from schemas import DayPlan, Itinerary, Meal, Slot
from tests.conftest import START, make_request
from utils.logistics import in_time_order, logistics_issues, logistics_penalty, minutes_of, travel_minutes

ALL_MEALS = [Meal(type=t, suggestion="x", cuisine="", cost=5) for t in ("breakfast", "lunch", "dinner")]


def _slot(time: str, activity: str, lat: float, lng: float) -> Slot:
    return Slot(period="morning", start_time=time, activity=activity, location="", cost=0, lat=lat, lng=lng)


def _day(n: int, slots: list[Slot], meals: list[Meal] = ALL_MEALS) -> DayPlan:
    return DayPlan(day=n, date=START + timedelta(days=n - 1), theme="", slots=slots, meals=meals, backup_options=[], total_cost=0)


def test_far_apart_stops_without_time_to_get_there_are_flagged():
    request = make_request(end_date=START + timedelta(days=2))
    # Ueno to Odaiba is ~11 km: ~37 min by road plus a visit, but only 45 min apart.
    tight = _day(2, [_slot("09:00", "Ueno Park", 35.7148, 139.7736), _slot("09:45", "Odaiba", 35.6267, 139.7756)])
    relaxed = _day(1, [_slot("09:00", "Ueno Park", 35.7148, 139.7736), _slot("13:00", "Odaiba", 35.6267, 139.7756)])
    issues = logistics_issues(request, Itinerary(days=[relaxed, tight, _day(3, [])], highlights=[], tips=[]))
    assert len(issues) == 1 and issues[0].startswith("Day 2: Ueno Park to Odaiba is ~10 km")


def test_missing_meals_are_flagged_except_on_arrival_and_departure_days():
    request = make_request(end_date=START + timedelta(days=2))
    lunch_only = [ALL_MEALS[1]]
    days = [_day(1, [], lunch_only), _day(2, [], lunch_only), _day(3, [], lunch_only)]
    assert logistics_issues(request, Itinerary(days=days, highlights=[], tips=[])) == ["Day 2 has no breakfast or dinner planned."]


def test_penalty_is_capped():
    assert logistics_penalty([]) == 0
    assert logistics_penalty(["x"] * 10) == 24


def test_times_and_travel_minutes():
    assert minutes_of("09:30") == 570 and minutes_of("7.05 am") == 425
    assert minutes_of("Morning") is None and minutes_of("25:00") is None
    assert travel_minutes(10) == 34


def test_slots_are_sorted_by_time_keeping_untimed_ones_in_place():
    slots = [_slot("15:00", "B", 0, 0), _slot("Evening", "C", 0, 0), _slot("09:00", "A", 0, 0)]
    assert [s.activity for s in in_time_order(slots)] == ["A", "B", "C"]
