import re

from pydantic import BaseModel, Field

from agents.base import GROUNDED_HINT, SYSTEM_BASE, AgentContext, route_text, user_input
from schemas import Neighborhood, ResearchResult, Source, TravelRequest


class ResearchDraft(BaseModel):
    overview: str
    highlights: list[str]
    neighborhoods: list[Neighborhood]
    cultural_tips: list[str]
    safety_tips: list[str]
    getting_around: str
    best_time_to_visit: str
    local_currency: str = Field(
        description="ISO 4217 code of the currency used at the destination (for several countries: where most nights are), e.g. JPY"
    )


SYSTEM = SYSTEM_BASE + (
    " You are a destination researcher. Produce a concise, factual briefing: a 2-3 sentence "
    "overview, 5-8 highlights, 3-5 neighbourhoods to stay in with who they suit, 4-6 cultural "
    "etiquette tips, 3-5 safety tips, how to get around, the best time to visit, and the "
    "ISO 4217 code of the local currency. For a multi-city trip, cover the whole route: the "
    "overview and highlights span every city, and give 1-2 neighbourhoods per city named "
    "'City: Neighbourhood'."
) + GROUNDED_HINT


async def run(ctx: AgentContext, request: TravelRequest) -> ResearchResult:
    sources: list[Source] = []
    user = (
        f"{route_text(request)}\n"
        f"Travel dates: {request.start_date} to {request.end_date} ({request.days} days)\n"
        f"Interests: {user_input(', '.join(request.preferences.interests) or 'general sightseeing')}\n"
        "Mention anything happening during these dates (festivals, closures, strikes)."
    )
    draft = await ctx.generate("research_agent", ResearchDraft, SYSTEM, user, grounded=True, sources=sources)
    data = draft.model_dump()
    code = data.pop("local_currency", "").strip().upper()
    return ResearchResult(**data, local_currency=code if re.fullmatch(r"[A-Z]{3}", code) else None, sources=sources[:8])
