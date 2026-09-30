"""Re-plans a single day when something changes ("it's raining on day 3").

Unlike a refine, which rewrites the whole itinerary, only the chosen day is
regenerated: every other day, and every stop id on them, stays exactly as it was.
"""

from pydantic import BaseModel

from agents.base import GROUNDED_HINT, SYSTEM_BASE, AgentContext, AgentOutputError, user_input
from agents.itinerary_agent import SLOTS_PER_PACE, DayDraft, accommodation_text
from schemas import ActivitiesResult, BookingsResult, DayPlan, Itinerary, Slot, TravelRequest, WeatherResult
from utils.geo import plausible_points
from utils.slots import carry_over_slot_ids


class ReplanDraft(BaseModel):
    day: DayDraft
    # One sentence the traveller sees about what changed and why.
    summary: str


SYSTEM = SYSTEM_BASE + (
    " You re-plan ONE day of an existing trip because something changed (weather, a closure, "
    "energy levels, a new wish). Keep what still works, replace what the change breaks, keep "
    "the same city and roughly the same spend, and avoid repeating stops from other days. "
    "Costs are totals for the whole group in USD. Give latitude and longitude for each stop."
) + GROUNDED_HINT


def _day_text(day: DayPlan) -> str:
    stops = "; ".join(f"{s.period} {s.start_time} {s.activity} @ {s.location} ${s.cost:.0f}" for s in day.slots) or "(nothing)"
    meals = "; ".join(f"{m.type}: {m.suggestion} ${m.cost:.0f}" for m in day.meals) or "(none)"
    return f"Theme: {day.theme}\nStops: {stops}\nMeals: {meals}"


async def run(
    ctx: AgentContext,
    request: TravelRequest,
    itinerary: Itinerary,
    day_number: int,
    reason: str,
    weather: WeatherResult | None,
    activities: ActivitiesResult | None,
    bookings: BookingsResult | None,
) -> tuple[DayPlan, str]:
    day = next((d for d in itinerary.days if d.day == day_number), None)
    if day is None:
        raise AgentOutputError(f"day {day_number} is not in the itinerary")
    city = day.city or request.destination
    forecast = next((w for w in (weather.days if weather else []) if w.date == day.date), None)
    other_stops = sorted({s.activity for d in itinerary.days if d.day != day_number for s in d.slots})
    unused = [a for a in (activities.activities if activities else []) if a.name not in other_stops and (not a.city or a.city == city)]
    user = (
        f"City: {user_input(city)}\n"
        f"Day {day.day} of {len(itinerary.days)}, {day.date}\n"
        f"Travellers: {request.travelers}; pace: {SLOTS_PER_PACE[request.preferences.pace]}\n"
        f"Interests: {user_input(', '.join(request.preferences.interests) or 'general sightseeing')}\n"
        f"Staying at: {accommodation_text(bookings)}\n"
        f"Weather that day: {f'{forecast.condition}, {forecast.temp_min_c:.0f}-{forecast.temp_max_c:.0f}°C, rain {forecast.precip_chance or 0}%' if forecast else '(unknown)'}\n"
        f"Current plan for the day (spend ${day.total_cost:,.0f}):\n{_day_text(day)}\n"
        f"Stops on other days (don't repeat): {'; '.join(other_stops) or '(none)'}\n"
        f"Unused curated ideas: {'; '.join(f'{a.name} ({a.location}, ~${a.estimated_cost:.0f})' for a in unused[:12]) or '(none)'}\n\n"
        f"What changed: {user_input(reason)}\n"
        f"Return the new plan for day {day.day} only."
    )
    draft = await ctx.generate("replan_agent", ReplanDraft, SYSTEM, user, grounded=True)
    if not draft.day.slots:
        raise AgentOutputError("the re-planned day has no stops")

    keep = plausible_points([(s.lat, s.lng) for s in draft.day.slots])
    slots = [
        Slot(
            period=s.period,
            start_time=s.start_time,
            activity=s.activity,
            location=s.location,
            cost=max(0.0, s.cost),
            lat=s.lat if ok else None,
            lng=s.lng if ok else None,
        )
        for s, ok in zip(draft.day.slots, keep)
    ]
    new_day = DayPlan(
        day=day.day,
        date=day.date,
        city=day.city,
        theme=draft.day.theme.strip() or day.theme,
        slots=slots,
        meals=draft.day.meals,
        backup_options=draft.day.backup_options,
        weather_note=draft.day.weather_note.strip() or None,
        total_cost=round(sum(s.cost for s in slots) + sum(m.cost for m in draft.day.meals), 2),
    )
    # Stops the day keeps retain their ids (and their votes and comments).
    kept = carry_over_slot_ids(Itinerary(days=[day], highlights=[], tips=[]), Itinerary(days=[new_day], highlights=[], tips=[]))
    return kept.days[0], draft.summary.strip()
