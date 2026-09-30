"""Concierge that answers questions about one specific plan."""

from pydantic import BaseModel, Field

from agents.base import SYSTEM_BASE, AgentContext, user_input
from schemas import ChatMessage, ChatReply, Source, TravelPlan

# Keep prompts bounded: only the most recent turns are sent.
MAX_TURNS = 12


class ChatDraft(BaseModel):
    answer: str = Field(description="Concise answer, at most about 120 words")
    change_request: str = Field(
        description="If the traveller asked to change the plan: one clear instruction for the planner. Otherwise empty."
    )
    suggestions: list[str] = Field(description="Up to 3 short follow-up questions the traveller might ask next")


SYSTEM = SYSTEM_BASE + (
    " You are the concierge for the trip described below. Answer the traveller's questions about "
    "THIS plan: refer to specific days, places and costs from it. Use Google Search for current "
    "facts (opening hours, prices, events, entry rules). Keep answers short and practical. Quote "
    "prices in the traveller's currency given in the plan summary. If the traveller asks to change "
    "the itinerary, don't rewrite it yourself: put a clear one-sentence instruction in "
    "change_request and say they can apply it. Never make up bookings or confirmations."
)


def _money(plan: TravelPlan):
    rate = plan.money.usd_rate if plan.money else 1.0
    currency = plan.money.currency if plan.money else "USD"
    return lambda usd: f"{usd * rate:,.0f} {currency}"


def plan_brief(plan: TravelPlan) -> str:
    """Compact text summary of a plan for the model."""
    fmt = _money(plan)
    trip, req = plan.trip, plan.request
    lines = [
        f"Trip: {trip.destination}, {trip.start_date} to {trip.end_date} ({trip.days} days), {trip.travelers} traveller(s)"
        + (f", flying from {trip.origin}" if trip.origin else ""),
        f"Interests: {', '.join(req.preferences.interests) or 'general'}; pace: {req.preferences.pace}; stay: {req.preferences.accommodation}",
        f"Budget: {fmt(plan.budget.total_budget)}; estimated total {fmt(plan.budget.estimated_total)} ({plan.budget.status})",
    ]
    if plan.money and plan.money.local_currency:
        lines.append(f"Local currency at destination: {plan.money.local_currency}")
    if plan.bookings and plan.bookings.hotels:
        hotel = plan.bookings.hotels[0]
        lines.append(f"Hotel: {hotel.name} in {hotel.area}")
    if plan.bookings and plan.bookings.flights:
        flight = plan.bookings.flights[0]
        lines.append(f"Flight: {flight.airline} {flight.departure_airport}-{flight.arrival_airport}")
    if plan.itinerary:
        for day in plan.itinerary.days:
            stops = "; ".join(f"{s.start_time} {s.activity} @ {s.location} ({fmt(s.cost)})" for s in day.slots)
            meals = "; ".join(f"{m.type}: {m.suggestion}" for m in day.meals)
            lines.append(f"Day {day.day} ({day.date}, {day.theme}): {stops}. Meals: {meals}")
    if plan.weather:
        lines.append(
            "Weather: "
            + "; ".join(f"{w.date} {w.condition} {w.temp_min_c:.0f}-{w.temp_max_c:.0f}C" for w in plan.weather.days)
        )
    if plan.research:
        lines.append(f"Getting around: {plan.research.getting_around}")
    return "\n".join(lines)


async def run(ctx: AgentContext, plan: TravelPlan, messages: list[ChatMessage]) -> ChatReply:
    recent = messages[-MAX_TURNS:]
    transcript = "\n".join(
        f"{'Traveller' if m.role == 'user' else 'Concierge'}: {user_input(m.content) if m.role == 'user' else m.content}"
        for m in recent
    )
    user = f"PLAN SUMMARY\n{plan_brief(plan)}\n\nCONVERSATION\n{transcript}\n\nReply to the traveller's last message."
    sources: list[Source] = []
    draft = await ctx.generate("chat_agent", ChatDraft, SYSTEM, user, grounded=True, sources=sources)
    return ChatReply(
        answer=draft.answer.strip(),
        change_request=draft.change_request.strip() or None,
        suggestions=[s.strip() for s in draft.suggestions if s.strip()][:3],
        sources=sources[:5],
    )
