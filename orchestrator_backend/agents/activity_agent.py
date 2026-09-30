from pydantic import BaseModel

from agents.base import GROUNDED_HINT, SYSTEM_BASE, AgentContext, match_city, route_text, user_input
from schemas import ActivitiesResult, Activity, ResearchResult, TravelRequest


class ActivitiesDraft(BaseModel):
    activities: list[Activity]


SYSTEM = SYSTEM_BASE + (
    " You are an activity curator. Recommend 12-18 real, specific activities (named places, "
    "tours, venues or dishes — not generic advice) spread across categories, weighted toward "
    "the traveller's interests. `estimated_cost` is the total for the whole group in USD "
    "(0 for free activities). For a multi-city trip, spread them across the cities in "
    "proportion to the nights spent and set `city` to the city's name exactly as given; "
    "otherwise leave `city` empty."
) + GROUNDED_HINT


async def run(ctx: AgentContext, request: TravelRequest, research: ResearchResult | None) -> ActivitiesResult:
    interests = ", ".join(request.preferences.interests) or "a balanced mix"
    context = ""
    if research:
        context = "Destination highlights: " + "; ".join(research.highlights) + "\n"
    user = (
        f"{route_text(request)}\n"
        f"Dates: {request.start_date} to {request.end_date}\n"
        f"Group size: {request.travelers}\n"
        f"Interests: {user_input(interests)}\n"
        f"Pace: {request.preferences.pace}\n"
        f"Total trip budget: ${request.budget:,.0f}\n"
        f"{context}"
    )
    draft = await ctx.generate("activity_agent", ActivitiesDraft, SYSTEM, user, grounded=True)
    cities = [stop.destination for stop in request.stops]
    return ActivitiesResult(activities=[a.model_copy(update={"city": match_city(a.city, cities)}) for a in draft.activities])
