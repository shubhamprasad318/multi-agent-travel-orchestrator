from pydantic import BaseModel

from agents.base import GROUNDED_HINT, SYSTEM_BASE, AgentContext, user_input
from schemas import Neighborhood, ResearchResult, Source, TravelRequest


class ResearchDraft(BaseModel):
    overview: str
    highlights: list[str]
    neighborhoods: list[Neighborhood]
    cultural_tips: list[str]
    safety_tips: list[str]
    getting_around: str
    best_time_to_visit: str


SYSTEM = SYSTEM_BASE + (
    " You are a destination researcher. Produce a concise, factual briefing: a 2-3 sentence "
    "overview, 5-8 highlights, 3-5 neighbourhoods to stay in with who they suit, 4-6 cultural "
    "etiquette tips, 3-5 safety tips, how to get around, and the best time to visit."
) + GROUNDED_HINT


async def run(ctx: AgentContext, request: TravelRequest) -> ResearchResult:
    sources: list[Source] = []
    user = (
        f"Destination: {user_input(request.destination)}\n"
        f"Travel dates: {request.start_date} to {request.end_date} ({request.days} days)\n"
        f"Interests: {user_input(', '.join(request.preferences.interests) or 'general sightseeing')}\n"
        "Mention anything happening during these dates (festivals, closures, strikes)."
    )
    draft = await ctx.generate("research_agent", ResearchDraft, SYSTEM, user, grounded=True, sources=sources)
    return ResearchResult(**draft.model_dump(), sources=sources[:8])
