from datetime import timedelta

from pydantic import BaseModel, Field

from agents.base import SYSTEM_BASE, AgentContext, AgentOutputError, user_input
from schemas import (
    ActivitiesResult,
    BookingsResult,
    DayPlan,
    Itinerary,
    Meal,
    Period,
    ResearchResult,
    Slot,
    TravelRequest,
    Validation,
    WeatherResult,
)
from utils.budget import ground_budget
from utils.geo import plausible_points


class SlotDraft(BaseModel):
    period: Period
    start_time: str
    activity: str
    location: str
    cost: float
    lat: float = Field(description="Latitude of the location, WGS84")
    lng: float = Field(description="Longitude of the location, WGS84")


class DayDraft(BaseModel):
    day: int
    theme: str
    slots: list[SlotDraft]
    meals: list[Meal]
    backup_options: list[str]
    weather_note: str


class ItineraryDraft(BaseModel):
    days: list[DayDraft]
    highlights: list[str]
    tips: list[str]


SYSTEM = SYSTEM_BASE + (
    " You are an itinerary planner. Build a realistic day-by-day plan: group nearby places on "
    "the same day, respect opening hours, keep travel time sensible, schedule outdoor plans on "
    "the best-weather days and give an indoor backup for rainy days. Day 1 and the last day "
    "are lighter because of arrival/departure. Every cost is the total for the whole group in "
    "USD; slot costs cover tickets and local transport, meal costs cover food. Keep the sum of "
    "all slot and meal costs within the on-the-ground budget. Use empty weather_note when "
    "there is nothing to say. Give the latitude and longitude of each slot's location as "
    "accurately as you can."
)

SLOTS_PER_PACE = {
    "relaxed": "1-2 activities per day with free time",
    "moderate": "2-3 activities per day",
    "fast": "3 packed activity slots per day",
}


def _weather_lines(weather: WeatherResult | None) -> str:
    if not weather:
        return "(no weather data)"
    return "\n".join(
        f"{d.date}: {d.condition}, {d.temp_min_c:.0f}-{d.temp_max_c:.0f}°C, rain {d.precip_chance or 0}%"
        for d in weather.days
    )


def _activity_lines(activities: ActivitiesResult | None) -> str:
    if not activities:
        return "(no curated activities — choose well-known ones)"
    return "\n".join(
        f"- [{a.category}] {a.name} ({a.location}; ~${a.estimated_cost:.0f}; {a.duration}; best {a.best_time})"
        for a in activities.activities
    )


def _previous_plan_text(previous: Itinerary) -> str:
    return "\n".join(
        f"Day {d.day} {d.theme}: " + "; ".join(f"{s.period} {s.activity} @ {s.location} ${s.cost:.0f}" for s in d.slots)
        for d in previous.days
    )


def _instruction_block(previous: Itinerary | None, instruction: str | None) -> str:
    if not previous or not instruction:
        return ""
    return (
        f"\n\nCurrent itinerary:\n{_previous_plan_text(previous)}\n\n"
        f"The traveller asked for this change: {user_input(instruction)}\n"
        "Apply the change. Keep every day that the request does not affect as it is.\n"
    )


def _feedback_block(previous: Itinerary | None, feedback: Validation | None) -> str:
    if not previous or not feedback:
        return ""
    issues = "\n".join(f"- {i}" for i in feedback.issues) or "- (none listed)"
    recs = "\n".join(f"- {r}" for r in feedback.recommendations) or "- (none listed)"
    themes = "; ".join(f"Day {d.day}: {d.theme}" for d in previous.days)
    return (
        f"\n\nA previous draft scored {feedback.overall_score}/100 and must be improved.\n"
        f"Previous day themes: {themes}\nIssues:\n{issues}\nRecommendations:\n{recs}\n"
    )


async def run(
    ctx: AgentContext,
    request: TravelRequest,
    research: ResearchResult | None,
    weather: WeatherResult | None,
    activities: ActivitiesResult | None,
    bookings: BookingsResult | None,
    previous: Itinerary | None = None,
    feedback: Validation | None = None,
    instruction: str | None = None,
) -> Itinerary:
    on_ground = ground_budget(request, bookings)
    hotel = bookings.hotels[0] if bookings and bookings.hotels else None
    base = f"{hotel.name} in {hotel.area}" if hotel else "(not chosen)"
    user = (
        f"Destination: {user_input(request.destination)}\n"
        f"Dates: {request.start_date} to {request.end_date} — exactly {request.days} days, numbered 1-{request.days}\n"
        f"Travellers: {request.travelers}\n"
        f"Interests: {user_input(', '.join(request.preferences.interests) or 'general sightseeing')}\n"
        f"Pace: {SLOTS_PER_PACE[request.preferences.pace]}\n"
        f"Accommodation base: {base}\n"
        f"On-the-ground budget (activities + food + local transport, whole group): ${on_ground:,.0f} "
        f"(about ${on_ground / request.days:,.0f} per day)\n"
        f"Neighbourhoods: {', '.join(n.name for n in research.neighborhoods) if research else '(unknown)'}\n\n"
        f"Weather by date:\n{_weather_lines(weather)}\n\n"
        f"Curated activities:\n{_activity_lines(activities)}"
        f"{_instruction_block(previous, instruction) or _feedback_block(previous, feedback)}"
    )
    draft = await ctx.generate("itinerary_agent", ItineraryDraft, SYSTEM, user)

    # The model numbers days; code assigns real dates and totals.
    by_day = {d.day: d for d in draft.days if 1 <= d.day <= request.days}
    if not by_day:
        raise AgentOutputError("itinerary contained no valid days")

    ordered = sorted(by_day.items())
    all_slots = [s for _, d in ordered for s in d.slots]
    keep_coords = iter(plausible_points([(s.lat, s.lng) for s in all_slots]))

    def to_slot(s: SlotDraft) -> Slot:
        ok = next(keep_coords)
        return Slot(
            period=s.period,
            start_time=s.start_time,
            activity=s.activity,
            location=s.location,
            cost=max(0.0, s.cost),
            lat=s.lat if ok else None,
            lng=s.lng if ok else None,
        )

    days = [
        DayPlan(
            day=n,
            date=request.start_date + timedelta(days=n - 1),
            theme=d.theme,
            slots=[to_slot(s) for s in d.slots],
            meals=d.meals,
            backup_options=d.backup_options,
            weather_note=d.weather_note.strip() or None,
            total_cost=round(sum(max(0.0, s.cost) for s in d.slots) + sum(m.cost for m in d.meals), 2),
        )
        for n, d in ordered
    ]
    return Itinerary(days=days, highlights=draft.highlights, tips=draft.tips)
