from pydantic import BaseModel

from agents.base import GROUNDED_HINT, SYSTEM_BASE, AgentContext, user_input
from schemas import ActivitiesResult, Activity, ResearchResult, TravelRequest


class ActivitiesDraft(BaseModel):
    activities: list[Activity]


SYSTEM = SYSTEM_BASE + (
    " You are an activity curator. Recommend 12-18 real, specific activities (named places, "
    "tours, venues or dishes — not generic advice) spread across categories, weighted toward "
    "the traveller's interests. `estimated_cost` is the total for the whole group in USD "
    "(0 for free activities)."
) + GROUNDED_HINT


async def run(ctx: AgentContext, request: TravelRequest, research: ResearchResult | None) -> ActivitiesResult:
    interests = ", ".join(request.preferences.interests) or "a balanced mix"
    context = ""
    if research:
        context = "Destination highlights: " + "; ".join(research.highlights) + "\n"
    user = (
        f"Destination: {user_input(request.destination)}\n"
        f"Dates: {request.start_date} to {request.end_date}\n"
        f"Group size: {request.travelers}\n"
        f"Interests: {user_input(interests)}\n"
        f"Pace: {request.preferences.pace}\n"
        f"Total trip budget: ${request.budget:,.0f}\n"
        f"{context}"
    )
    draft = await ctx.generate("activity_agent", ActivitiesDraft, SYSTEM, user, grounded=True)
    return ActivitiesResult(activities=draft.activities)
