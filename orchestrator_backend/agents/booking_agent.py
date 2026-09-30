from urllib.parse import quote_plus, urlencode

from pydantic import BaseModel

from agents.base import GROUNDED_HINT, SYSTEM_BASE, AgentContext, user_input
from schemas import BookingsResult, Flight, Hotel, ResearchResult, TravelRequest


class FlightDraft(BaseModel):
    airline: str
    departure_airport: str
    arrival_airport: str
    stops: int
    duration: str
    price_per_person: float


class HotelDraft(BaseModel):
    name: str
    area: str
    type: str
    rating: float
    price_per_night: float
    amenities: list[str]


class BookingDraft(BaseModel):
    flights: list[FlightDraft]
    hotels: list[HotelDraft]
    notes: list[str]


SYSTEM = SYSTEM_BASE + (
    " You are a booking specialist. Suggest 2-3 realistic round-trip economy flight options "
    "(airlines that actually fly the route, IATA airport codes, realistic durations and "
    "round-trip price PER PERSON) and 3 real accommodation options matching the requested tier, "
    "best match first, with a realistic nightly price PER ROOM, a 0-5 rating and 3-5 key amenities. Prices are "
    "estimates for the travel season. Do not include URLs."
) + GROUNDED_HINT

TIER_HINT = {
    "budget": "hostels, guesthouses or 2-star hotels",
    "mid-range": "3-4 star hotels",
    "luxury": "5-star or boutique luxury hotels",
}


def flight_search_url(request: TravelRequest) -> str:
    query = f"Flights from {request.origin} to {request.destination} on {request.start_date} returning {request.end_date}"
    return f"https://www.google.com/travel/flights?q={quote_plus(query)}"


def hotel_search_url(request: TravelRequest, hotel_name: str) -> str:
    params = {
        "ss": f"{hotel_name}, {request.destination}",
        "checkin": request.start_date.isoformat(),
        "checkout": request.end_date.isoformat(),
        "group_adults": request.travelers,
        "no_rooms": request.rooms,
    }
    return f"https://www.booking.com/searchresults.html?{urlencode(params)}"


async def run(ctx: AgentContext, request: TravelRequest, research: ResearchResult | None) -> BookingsResult:
    accommodation = request.preferences.accommodation
    areas = ", ".join(n.name for n in research.neighborhoods) if research else "(unknown)"
    flight_instruction = (
        f"Origin: {user_input(request.origin)}"
        if request.origin
        else "No origin was given: return an EMPTY flights list."
    )
    lodging_instruction = (
        f"Stay: {request.nights} nights, {request.rooms} room(s) for {request.travelers} traveller(s), "
        f"tier: {TIER_HINT[accommodation]}. Prefer these areas: {areas}"
        if request.nights > 0
        else "This is a same-day trip: return an EMPTY hotels list."
    )
    user = (
        f"Destination: {user_input(request.destination)}\n"
        f"Dates: {request.start_date} to {request.end_date}\n"
        f"{flight_instruction}\n{lodging_instruction}\n"
        f"Total trip budget for the group: ${request.budget:,.0f}"
    )
    draft = await ctx.generate("booking_agent", BookingDraft, SYSTEM, user, grounded=True)

    flights: list[Flight] = []
    if request.origin:
        flights = sorted(
            (
                Flight(
                    **f.model_dump(),
                    total_price=round(f.price_per_person * request.travelers, 2),
                    search_url=flight_search_url(request),
                )
                for f in draft.flights
                if f.price_per_person > 0
            ),
            key=lambda f: f.total_price,
        )

    hotels: list[Hotel] = []
    if request.nights > 0:
        hotels = [
            Hotel(
                name=h.name,
                area=h.area,
                type=h.type,
                rating=h.rating if 0 < h.rating <= 5 else None,
                price_per_night=h.price_per_night,
                rooms=request.rooms,
                nights=request.nights,
                total_price=round(h.price_per_night * request.rooms * request.nights, 2),
                amenities=h.amenities[:6],
                search_url=hotel_search_url(request, h.name),
            )
            for h in draft.hotels
            if h.price_per_night > 0
        ]

    notes = list(draft.notes)
    if not request.origin:
        notes.insert(0, "Add a departure city to get flight estimates.")
    return BookingsResult(flights=flights, hotels=hotels, notes=notes)
