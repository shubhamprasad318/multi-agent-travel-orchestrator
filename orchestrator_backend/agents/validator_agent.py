from pydantic import BaseModel, Field

from agents.base import SYSTEM_BASE, AgentContext, route_text, user_input
from config import VALIDATION_CONFIG
from schemas import (
    ActivitiesResult,
    BookingsResult,
    BudgetBreakdown,
    Itinerary,
    TravelRequest,
    Validation,
    WeatherResult,
)
from utils.budget import budget_score


class ValidatorDraft(BaseModel):
    itinerary_quality: int = Field(description="0-100")
    weather_suitability: int = Field(description="0-100")
    activity_diversity: int = Field(description="0-100")
    booking_availability: int = Field(description="0-100")
    overall_coherence: int = Field(description="0-100")
    issues: list[str]
    recommendations: list[str]


SYSTEM = SYSTEM_BASE + (
    " You are a strict travel-plan reviewer. Score each category 0-100 (90+ excellent, "
    "70-89 good, 50-69 flawed, <50 poor). Check for: impossible schedules, far-apart places "
    "on the same day, outdoor plans on bad-weather days without a backup, repetitive "
    "activities, interests ignored, and missing accommodation. List concrete issues and "
    "actionable recommendations (max 5 each). Budget is scored separately; do not score it."
)


def status_for(score: int) -> str:
    if score >= VALIDATION_CONFIG["approval_threshold"]:
        return "Approved"
    if score >= VALIDATION_CONFIG["needs_review_threshold"]:
        return "Needs Review"
    return "Rejected"


def weighted_score(scores: dict[str, int]) -> int:
    weights = VALIDATION_CONFIG["weights"]
    return round(sum(scores[k] * w for k, w in weights.items()) / 100)


def _structural_issues(request: TravelRequest, itinerary: Itinerary, budget: BudgetBreakdown) -> list[str]:
    issues = []
    if len(itinerary.days) < request.days:
        issues.append(f"Itinerary covers {len(itinerary.days)} of {request.days} days.")
    empty = [str(d.day) for d in itinerary.days if not d.slots]
    if empty:
        issues.append(f"No activities planned on day(s) {', '.join(empty)}.")
    if budget.status in ("Slightly Over", "Over Budget"):
        issues.append(f"Estimated cost ${budget.estimated_total:,.0f} is {budget.variance_pct:+.0f}% vs the budget.")
    return issues


async def run(
    ctx: AgentContext,
    request: TravelRequest,
    itinerary: Itinerary | None,
    weather: WeatherResult | None,
    activities: ActivitiesResult | None,
    bookings: BookingsResult | None,
    budget: BudgetBreakdown,
) -> Validation:
    if itinerary is None:
        scores = {k: 0 for k in VALIDATION_CONFIG["weights"]}
        return Validation(
            overall_score=0,
            status="Rejected",
            category_scores=scores,
            issues=["No itinerary could be generated."],
            recommendations=["Try again, or adjust the destination or dates."],
        )

    days_text = "\n".join(
        f"Day {d.day} ({d.date}{f', {d.city}' if d.city else ''}) {d.theme}: "
        + "; ".join(f"{s.period} {s.activity} @ {s.location} ${s.cost:.0f}" for s in d.slots)
        + (f" | note: {d.weather_note}" if d.weather_note else "")
        for d in itinerary.days
    )
    weather_text = (
        "\n".join(f"{w.date}: {w.condition}, rain {w.precip_chance or 0}%" for w in weather.days)
        if weather
        else "(no weather data)"
    )
    hotel_text = (
        "; ".join(f"{h.name} ({f'{h.city}, ' if h.city else ''}{h.area}) ${h.price_per_night:.0f}/night" for h in bookings.hotels)
        if bookings and bookings.hotels
        else "(none)"
    )
    user = (
        f"{route_text(request)}; {request.days} days; {request.travelers} traveller(s)\n"
        f"Interests: {user_input(', '.join(request.preferences.interests) or 'general')}; pace: {request.preferences.pace}\n"
        f"Accommodation options: {hotel_text}\n"
        f"Flights found: {len(bookings.flights) if bookings else 0} (origin given: {bool(request.origin)})\n"
        f"Curated activities available: {len(activities.activities) if activities else 0}\n\n"
        f"Weather:\n{weather_text}\n\nItinerary:\n{days_text}"
    )
    draft = await ctx.generate("validator_agent", ValidatorDraft, SYSTEM, user)

    def clamp(value: int) -> int:
        return max(0, min(100, int(value)))

    scores = {
        "itinerary_quality": clamp(draft.itinerary_quality),
        "budget_feasibility": budget_score(budget),
        "weather_suitability": clamp(draft.weather_suitability) if weather else 50,
        "activity_diversity": clamp(draft.activity_diversity),
        "booking_availability": clamp(draft.booking_availability) if bookings else 0,
        "overall_coherence": clamp(draft.overall_coherence),
    }
    overall = weighted_score(scores)
    return Validation(
        overall_score=overall,
        status=status_for(overall),
        category_scores=scores,
        issues=_structural_issues(request, itinerary, budget) + draft.issues[:5],
        recommendations=draft.recommendations[:5],
    )
