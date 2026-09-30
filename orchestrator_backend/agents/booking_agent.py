from datetime import date
from urllib.parse import quote_plus, urlencode

from pydantic import BaseModel, Field

from agents.base import GROUNDED_HINT, SYSTEM_BASE, AgentContext, match_city, route_text, user_input
from schemas import BookingsResult, Flight, Hotel, ResearchResult, Transfer, TravelRequest
from utils.fares import Fare, FareLookup
from utils.logger import get_logger

logger = get_logger(__name__)


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
    # Multi-city trips only: which stop the hotel is for.
    city: str | None = None


class TransferDraft(BaseModel):
    from_city: str
    to_city: str
    mode: str = Field(description="train, bus, flight, ferry or car")
    duration: str
    price_per_person: float
    notes: str


class BookingDraft(BaseModel):
    flights: list[FlightDraft]
    hotels: list[HotelDraft]
    notes: list[str]
    transfers: list[TransferDraft] = Field(default_factory=list)


SYSTEM = SYSTEM_BASE + (
    " You are a booking specialist. Suggest 2-3 realistic round-trip economy flight options "
    "(airlines that actually fly the route, IATA airport codes, realistic durations and "
    "round-trip price PER PERSON) and 3 real accommodation options matching the requested tier, "
    "best match first, with a realistic nightly price PER ROOM, a 0-5 rating and 3-5 key amenities. Prices are "
    "estimates for the travel season. Do not include URLs. For a multi-city trip: flights fly into "
    "the first city and home from the last one (open-jaw), give 2 accommodation options PER CITY "
    "with `city` set to that city's name exactly as given, and one transfer between each pair of "
    "consecutive cities using the most sensible mode, with a realistic duration and price PER PERSON."
) + GROUNDED_HINT

TIER_HINT = {
    "budget": "hostels, guesthouses or 2-star hotels",
    "mid-range": "3-4 star hotels",
    "luxury": "5-star or boutique luxury hotels",
}

# Recent real fares shown next to the estimates (each marked price_source="recent_fare").
MAX_RECENT_FARES = 2


def flight_search_url(request: TravelRequest) -> str:
    if request.stops:
        first, last = request.stops[0].destination, request.stops[-1].destination
        query = f"Flights from {request.origin} to {first} on {request.start_date}, returning from {last} to {request.origin} on {request.end_date}"
    else:
        query = f"Flights from {request.origin} to {request.destination} on {request.start_date} returning {request.end_date}"
    return f"https://www.google.com/travel/flights?q={quote_plus(query)}"


def hotel_search_url(request: TravelRequest, hotel_name: str, place: str | None = None, dates: tuple[date, date] | None = None) -> str:
    check_in, check_out = dates or (request.start_date, request.end_date)
    params = {
        "ss": f"{hotel_name}, {place or request.destination}",
        "checkin": check_in.isoformat(),
        "checkout": check_out.isoformat(),
        "group_adults": request.travelers,
        "no_rooms": request.rooms,
    }
    return f"https://www.booking.com/searchresults.html?{urlencode(params)}"


def _lodging_instruction(request: TravelRequest, areas: str) -> str:
    tier = TIER_HINT[request.preferences.accommodation]
    if request.nights == 0:
        return "This is a same-day trip: return an EMPTY hotels list."
    if request.stops:
        per_city = "; ".join(f"{user_input(s.destination)}: {s.nights} night(s)" for s in request.stops)
        return (
            f"Stay: {request.rooms} room(s) for {request.travelers} traveller(s), tier: {tier}. "
            f"Nights per city: {per_city}. Prefer these areas: {areas}"
        )
    return (
        f"Stay: {request.nights} nights, {request.rooms} room(s) for {request.travelers} traveller(s), "
        f"tier: {tier}. Prefer these areas: {areas}"
    )


def _hotels(request: TravelRequest, drafts: list[HotelDraft]) -> list[Hotel]:
    if request.nights == 0:
        return []

    def hotel(h: HotelDraft, nights: int, city: str | None, dates: tuple[date, date] | None) -> Hotel:
        return Hotel(
            name=h.name,
            area=h.area,
            type=h.type,
            rating=h.rating if 0 < h.rating <= 5 else None,
            price_per_night=h.price_per_night,
            rooms=request.rooms,
            nights=nights,
            total_price=round(h.price_per_night * request.rooms * nights, 2),
            amenities=h.amenities[:6],
            search_url=hotel_search_url(request, h.name, city, dates),
            city=city,
        )

    valid = [h for h in drafts if h.price_per_night > 0]
    if not request.stops:
        return [hotel(h, request.nights, None, None) for h in valid]
    cities = [stop.destination for stop in request.stops]
    hotels = []
    # Grouped in route order; within a city the model's order (best match first) is kept.
    for stop, check_in, check_out in request.stop_dates():
        for h in valid:
            if match_city(h.city, cities) == stop.destination:
                hotels.append(hotel(h, stop.nights, stop.destination, (check_in, check_out)))
    return hotels


def _transfers(request: TravelRequest, drafts: list[TransferDraft]) -> list[Transfer]:
    cities = [stop.destination for stop in request.stops]
    by_destination = {match_city(t.to_city, cities): t for t in reversed(drafts)}
    transfers = []
    legs = request.stop_dates()
    for index, ((stop, _, move_date), (next_stop, _, _)) in enumerate(zip(legs, legs[1:])):
        # Matched by destination city; fall back to position if the model renamed it.
        draft = by_destination.get(next_stop.destination) or (drafts[index] if index < len(drafts) else None)
        if draft is None:
            continue
        transfers.append(
            Transfer(
                from_city=stop.destination,
                to_city=next_stop.destination,
                date=move_date,
                mode=draft.mode.strip().lower() or "train",
                duration=draft.duration,
                cost=round(max(0.0, draft.price_per_person) * request.travelers, 2),
                notes=draft.notes.strip() or None,
            )
        )
    return transfers


def _fare_flight(fare: Fare, request: TravelRequest) -> Flight:
    hours, minutes = divmod(fare.duration_minutes or 0, 60)
    return Flight(
        airline=fare.airline,
        departure_airport=fare.origin_airport,
        arrival_airport=fare.destination_airport,
        stops=fare.transfers,
        duration=f"{hours}h {minutes:02d}m" if fare.duration_minutes else "—",
        price_per_person=round(fare.price, 2),
        total_price=round(fare.price * request.travelers, 2),
        search_url=fare.link,
        price_source="recent_fare",
        departure_at=fare.departure_at,
        return_at=fare.return_at,
    )


async def _recent_fares(lookup: FareLookup, request: TravelRequest, estimates: list[Flight]) -> list[Flight]:
    """Real recent fares for the route the estimates use (single-destination round trips only)."""
    if request.stops or not estimates:
        return []
    try:
        fares = await lookup(estimates[0].departure_airport, estimates[0].arrival_airport, request.start_date, request.end_date)
    except Exception as exc:  # noqa: BLE001 - fares are a bonus
        logger.warning("recent fares failed: %s", exc)
        return []
    return [_fare_flight(fare, request) for fare in fares[:MAX_RECENT_FARES]]


async def run(ctx: AgentContext, request: TravelRequest, research: ResearchResult | None) -> BookingsResult:
    areas = ", ".join(n.name for n in research.neighborhoods) if research else "(unknown)"
    flight_instruction = (
        f"Origin: {user_input(request.origin)}"
        if request.origin
        else "No origin was given: return an EMPTY flights list."
    )
    user = (
        f"{route_text(request)}\n"
        f"Dates: {request.start_date} to {request.end_date}\n"
        f"{flight_instruction}\n{_lodging_instruction(request, areas)}\n"
        f"Total trip budget for the group: ${request.budget:,.0f}"
    )
    draft = await ctx.generate("booking_agent", BookingDraft, SYSTEM, user, grounded=True)

    flights: list[Flight] = []
    notes = list(draft.notes)
    if request.origin:
        flights = [
            Flight(
                **f.model_dump(),
                total_price=round(f.price_per_person * request.travelers, 2),
                search_url=flight_search_url(request),
            )
            for f in draft.flights
            if f.price_per_person > 0
        ]
        lookup = ctx.fare_lookup()
        recent = await _recent_fares(lookup, request, sorted(flights, key=lambda f: f.total_price)) if lookup else []
        # Cheapest first: the budget counts the cheapest option.
        flights = sorted([*recent, *flights], key=lambda f: f.total_price)

    if not request.origin:
        notes.insert(0, "Add a departure city to get flight estimates.")
    return BookingsResult(
        flights=flights,
        hotels=_hotels(request, draft.hotels),
        transfers=_transfers(request, draft.transfers) if request.stops else [],
        notes=notes,
    )
