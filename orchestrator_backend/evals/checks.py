"""Deterministic quality checks over a finished `TravelPlan`.

Each check returns a `CheckResult`. `passed=None` means the check does not
apply to this plan (e.g. a missing section) and is excluded from pass rates.
"""

from dataclasses import asdict, dataclass
from datetime import timedelta

from schemas import TravelPlan

# Activity slots per day allowed for each pace (min is always 1).
MAX_SLOTS_PER_PACE = {"relaxed": 2, "moderate": 3, "fast": 4}
MIN_COORDINATE_COVERAGE = 0.7


@dataclass
class CheckResult:
    name: str
    passed: bool | None
    detail: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def covers_all_days(plan: TravelPlan) -> CheckResult:
    got = len(plan.itinerary.days) if plan.itinerary else 0
    return CheckResult("covers_all_days", got == plan.trip.days, f"{got}/{plan.trip.days} days")


def dates_consecutive(plan: TravelPlan) -> CheckResult:
    days = plan.itinerary.days if plan.itinerary else []
    expected = [plan.trip.start_date + timedelta(days=i) for i in range(len(days))]
    actual = [d.date for d in days]
    return CheckResult("dates_consecutive", actual == expected, "" if actual == expected else f"got {actual}")


def no_empty_days(plan: TravelPlan) -> CheckResult:
    empty = [d.day for d in (plan.itinerary.days if plan.itinerary else []) if not d.slots]
    return CheckResult("no_empty_days", not empty, f"empty days: {empty}" if empty else "")


def pace_respected(plan: TravelPlan) -> CheckResult:
    limit = MAX_SLOTS_PER_PACE[plan.request.preferences.pace]
    bad = [
        f"day {d.day}: {len(d.slots)}"
        for d in (plan.itinerary.days if plan.itinerary else [])
        if not 1 <= len(d.slots) <= limit
    ]
    return CheckResult("pace_respected", not bad, f"max {limit}/day; " + ", ".join(bad) if bad else f"max {limit}/day")


def meals_present(plan: TravelPlan) -> CheckResult:
    missing = [d.day for d in (plan.itinerary.days if plan.itinerary else []) if not d.meals]
    return CheckResult("meals_present", not missing, f"no meals on days {missing}" if missing else "")


def budget_respected(plan: TravelPlan) -> CheckResult:
    return CheckResult(
        "budget_respected",
        plan.budget.status != "Over Budget",
        f"{plan.budget.status} ({plan.budget.variance_pct:+.1f}%)",
    )


def no_repeated_activities(plan: TravelPlan) -> CheckResult:
    seen: dict[str, int] = {}
    repeats: list[str] = []
    for day in plan.itinerary.days if plan.itinerary else []:
        for slot in day.slots:
            key = " ".join(slot.activity.lower().split())
            if key in seen and seen[key] != day.day:
                repeats.append(slot.activity)
            seen.setdefault(key, day.day)
    return CheckResult("no_repeated_activities", not repeats, f"repeated: {repeats}" if repeats else "")


def coordinates_present(plan: TravelPlan) -> CheckResult:
    slots = [s for d in (plan.itinerary.days if plan.itinerary else []) for s in d.slots]
    if not slots:
        return CheckResult("coordinates_present", None, "no slots")
    located = sum(1 for s in slots if s.lat is not None and s.lng is not None)
    share = located / len(slots)
    return CheckResult("coordinates_present", share >= MIN_COORDINATE_COVERAGE, f"{located}/{len(slots)} located")


def cities_follow_route(plan: TravelPlan) -> CheckResult:
    """Multi-city: every day is in the right city, one hotel per city, a transfer per move."""
    if not plan.request.stops:
        return CheckResult("cities_follow_route", None, "single destination")
    days = plan.itinerary.days if plan.itinerary else []
    expected = plan.request.day_cities()[: len(days)]
    wrong = [d.day for d, city in zip(days, expected) if d.city != city]
    hotel_cities = {h.city for h in plan.bookings.hotels} if plan.bookings else set()
    missing_hotels = [s.destination for s in plan.request.stops if s.destination not in hotel_cities]
    transfers = len(plan.bookings.transfers) if plan.bookings else 0
    problems = []
    if wrong:
        problems.append(f"wrong city on days {wrong}")
    if missing_hotels:
        problems.append(f"no hotel in {missing_hotels}")
    if transfers != len(plan.request.stops) - 1:
        problems.append(f"{transfers} transfers for {len(plan.request.stops)} cities")
    return CheckResult("cities_follow_route", not problems, "; ".join(problems))


def flights_only_with_origin(plan: TravelPlan) -> CheckResult:
    if plan.bookings is None:
        return CheckResult("flights_only_with_origin", None, "no bookings section")
    has_flights = bool(plan.bookings.flights)
    has_origin = bool(plan.request.origin)
    ok = has_flights == has_origin
    return CheckResult("flights_only_with_origin", ok, f"origin={has_origin}, flights={len(plan.bookings.flights)}")


def grounded_sources(plan: TravelPlan) -> CheckResult:
    # Informational: grounding may be unavailable for some keys/models.
    if plan.research is None:
        return CheckResult("grounded_sources", None, "no research section")
    count = len(plan.research.sources)
    return CheckResult("grounded_sources", count > 0, f"{count} sources")


ALL_CHECKS = [
    covers_all_days,
    dates_consecutive,
    no_empty_days,
    pace_respected,
    meals_present,
    budget_respected,
    no_repeated_activities,
    coordinates_present,
    cities_follow_route,
    flights_only_with_origin,
    grounded_sources,
]


def run_checks(plan: TravelPlan) -> list[CheckResult]:
    return [check(plan) for check in ALL_CHECKS]
