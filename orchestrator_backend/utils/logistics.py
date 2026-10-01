"""Checks a model can't be trusted to do in its head: travel time between stops, meals.

Each problem becomes a concrete validator issue ("Day 3: Dimna Lake to Jubilee Park is
~14 km, about 45 min by road, but only 30 min apart"), costs itinerary-quality points,
and is fed back to the planner when a plan is revised.
"""

import re

from schemas import DayPlan, Itinerary, TravelRequest
from utils.geo import haversine_km

# Door-to-door by road in and around a city: winding roads and traffic make it slower than
# the straight-line distance suggests.
ROAD_FACTOR = 1.4
CITY_SPEED_KMH = 25
# Time a visit takes before moving on, when the next stop's time leaves room for nothing else.
MIN_VISIT_MINUTES = 30
# Hops shorter than this are walkable or a quick ride; not worth checking.
MIN_CHECKED_KM = 3
POINTS_PER_ISSUE = 6
MAX_PENALTY = 24

_TIME = re.compile(r"^\s*(\d{1,2})[:.](\d{2})")


def minutes_of(start_time: str) -> int | None:
    """"09:30" -> 570; None when the model wrote something else ("Morning")."""
    match = _TIME.match(start_time)
    if not match:
        return None
    hours, minutes = int(match.group(1)), int(match.group(2))
    return hours * 60 + minutes if hours < 24 and minutes < 60 else None


def travel_minutes(km: float) -> int:
    return round(km * ROAD_FACTOR / CITY_SPEED_KMH * 60)


def _tight_hops(day: DayPlan) -> list[str]:
    issues = []
    for here, there in zip(day.slots, day.slots[1:]):
        if None in (here.lat, here.lng, there.lat, there.lng):
            continue
        start, next_start = minutes_of(here.start_time), minutes_of(there.start_time)
        if start is None or next_start is None:
            continue
        km = haversine_km(here.lat, here.lng, there.lat, there.lng)
        if km < MIN_CHECKED_KM:
            continue
        needed = travel_minutes(km)
        gap = next_start - start
        if gap < needed + MIN_VISIT_MINUTES:
            issues.append(
                f"Day {day.day}: {here.activity} to {there.activity} is ~{km:.0f} km (about {needed} min by road), "
                f"but they're only {max(gap, 0)} min apart."
            )
    return issues


def _missing_meals(day: DayPlan, last_day: int) -> str | None:
    # The first and last days are shaped by arrival and departure times.
    if day.day in (1, last_day):
        return None
    missing = [meal for meal in ("breakfast", "lunch", "dinner") if meal not in {m.type for m in day.meals}]
    return f"Day {day.day} has no {' or '.join(missing)} planned." if missing else None


def logistics_issues(request: TravelRequest, itinerary: Itinerary) -> list[str]:
    issues: list[str] = []
    for day in itinerary.days:
        issues += _tight_hops(day)
        meals = _missing_meals(day, request.days)
        if meals:
            issues.append(meals)
    return issues


def logistics_penalty(issues: list[str]) -> int:
    return min(MAX_PENALTY, POINTS_PER_ISSUE * len(issues))


def in_time_order(day_slots: list, start_time=lambda slot: slot.start_time) -> list:
    """Slots sorted by start time; slots without a readable time keep their place after the timed ones before them."""
    keyed = []
    last = -1
    for index, slot in enumerate(day_slots):
        minutes = minutes_of(start_time(slot))
        last = minutes if minutes is not None else last
        keyed.append((last, index, slot))
    return [slot for _, _, slot in sorted(keyed, key=lambda item: (item[0], item[1]))]
