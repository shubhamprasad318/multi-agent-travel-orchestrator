"""API contract shared by the orchestrator, the HTTP layer and (mirrored in
`frontend/lib/types.ts`) the frontend.

All money values in responses are USD totals for the whole travelling group
unless the field name says otherwise (e.g. `price_per_person`,
`price_per_night`). Models estimate most reliably in USD, so everything is
planned in USD; `TravelPlan.money` carries the exchange rates the frontend
uses to show the traveller's own currency and the destination's.

The one exception is `TravelRequest.budget`, which is in `TravelRequest.currency`.
"""

import uuid
from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator

from config import get_settings

Pace = Literal["relaxed", "moderate", "fast"]
Accommodation = Literal["budget", "mid-range", "luxury"]
ActivityCategory = Literal[
    "must_do", "food", "hidden_gem", "nightlife", "day_trip", "culture", "nature", "wellness", "shopping"
]
Period = Literal["morning", "afternoon", "evening"]
MealType = Literal["breakfast", "lunch", "dinner"]
BudgetStatus = Literal["Within Budget", "Slightly Over", "Over Budget", "Unknown"]
ValidationStatus = Literal["Approved", "Needs Review", "Rejected"]
AgentName = Literal["research", "weather", "activity", "booking", "itinerary", "validator", "revision", "replan"]
PackingCategory = Literal["clothing", "gear", "documents", "health", "tech", "other"]

# Multi-city trips: at most this many cities, joined like "Tokyo → Kyoto" for display.
MAX_STOPS = 5
ROUTE_JOINER = " → "


# --------------------------------------------------------------------------- #
# Request
# --------------------------------------------------------------------------- #


class Preferences(BaseModel):
    interests: list[str] = Field(default_factory=list, max_length=10)
    pace: Pace = "moderate"
    accommodation: Accommodation = "mid-range"

    @field_validator("interests")
    @classmethod
    def _normalize_interests(cls, value: list[str]) -> list[str]:
        seen: list[str] = []
        for item in value:
            cleaned = item.strip().lower()[:40]
            if cleaned and cleaned not in seen:
                seen.append(cleaned)
        return seen


class TripStop(BaseModel):
    """One city of a multi-city trip and the nights spent there."""

    destination: str = Field(min_length=2, max_length=60)
    nights: int = Field(ge=1, le=30)

    @field_validator("destination")
    @classmethod
    def _strip(cls, value: str) -> str:
        return " ".join(value.split())


class TravelRequest(BaseModel):
    # Older clients also send `duration`; it is derived from the dates here.
    model_config = ConfigDict(extra="ignore")

    # Required for a single destination. For multi-city trips it may be omitted:
    # it's set to the route ("Tokyo → Kyoto → Osaka").
    destination: str = Field(default="", max_length=320)
    # Multi-city trips: the cities in travel order. Empty for a single destination.
    stops: list[TripStop] = Field(default_factory=list, max_length=MAX_STOPS)
    origin: str | None = Field(default=None, max_length=100)
    start_date: date
    end_date: date
    # Large upper bound because some currencies have big nominal values (IDR, VND);
    # the USD-equivalent limit is enforced when the budget is converted.
    budget: float = Field(gt=0, le=1e12, description="Total budget for the whole group, in `currency`")
    currency: str = Field(default="USD", pattern=r"^[A-Za-z]{3}$", description="ISO 4217 code of the budget")
    travelers: int = Field(ge=1, le=10)
    preferences: Preferences = Field(default_factory=Preferences)

    @field_validator("currency")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.upper()

    @field_validator("destination", "origin")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = " ".join(value.split())
        return value or None

    @model_validator(mode="after")
    def _check_dates(self, info: ValidationInfo) -> "TravelRequest":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if len(self.stops) == 1:
            # A one-city route is just a destination.
            self.destination, self.stops = self.stops[0].destination, []
        if not self.stops and len(self.destination or "") < 2:
            raise ValueError("destination is required")
        if self.stops:
            if any(len(stop.destination) < 2 for stop in self.stops):
                raise ValueError("every stop needs a destination")
            if sum(stop.nights for stop in self.stops) != self.nights:
                raise ValueError(f"the stops' nights must add up to the trip's {self.nights} nights")
            self.destination = ROUTE_JOINER.join(stop.destination for stop in self.stops)
        # Saved plans are reloaded for refinement even after their dates pass.
        if (info.context or {}).get("stored"):
            return self
        # One day of slack so users west of UTC can still pick "today".
        if self.start_date < date.today() - timedelta(days=1):
            raise ValueError("start_date cannot be in the past")
        max_days = get_settings().max_trip_days
        if self.days > max_days:
            raise ValueError(f"trips longer than {max_days} days are not supported")
        return self

    @property
    def days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    @property
    def nights(self) -> int:
        return (self.end_date - self.start_date).days

    @property
    def rooms(self) -> int:
        return max(1, -(-self.travelers // 2))

    def day_cities(self) -> list[str]:
        """The city of each day (index 0 is day 1).

        A day belongs to the city where that night is spent, so the day you move
        is the first day in the new city; the last day stays in the last city.
        """
        if not self.stops:
            return [self.destination] * self.days
        return [stop.destination for stop in self.stops for _ in range(stop.nights)] + [self.stops[-1].destination]

    def stop_dates(self) -> list[tuple[TripStop, date, date]]:
        """(stop, check-in, check-out) for each stop of a multi-city trip."""
        result, check_in = [], self.start_date
        for stop in self.stops:
            check_out = check_in + timedelta(days=stop.nights)
            result.append((stop, check_in, check_out))
            check_in = check_out
        return result


# --------------------------------------------------------------------------- #
# Agent results
# --------------------------------------------------------------------------- #


class Source(BaseModel):
    title: str
    url: str


class Neighborhood(BaseModel):
    name: str
    description: str
    good_for: str


class ResearchResult(BaseModel):
    overview: str
    highlights: list[str]
    neighborhoods: list[Neighborhood]
    cultural_tips: list[str]
    safety_tips: list[str]
    getting_around: str
    best_time_to_visit: str
    # ISO 4217 code of the money used at the destination, e.g. "JPY".
    local_currency: str | None = None
    sources: list[Source] = Field(default_factory=list)


class WeatherDay(BaseModel):
    date: date
    condition: str
    temp_min_c: float
    temp_max_c: float
    precip_chance: int | None = Field(default=None, ge=0, le=100)
    # Multi-city trips: the city this day's weather is for.
    location: str | None = None


class PackingItem(BaseModel):
    item: str
    category: PackingCategory = "other"
    # Why it's worth packing for this trip, e.g. "rain on day 3".
    reason: str | None = None


class WeatherResult(BaseModel):
    # "forecast": live API data for every day; "climate_estimate": model
    # knowledge of typical conditions; "mixed": some of each.
    source: Literal["forecast", "climate_estimate", "mixed"]
    summary: str
    days: list[WeatherDay]
    packing_list: list[str]
    advisories: list[str] = Field(default_factory=list)
    # The packing list with categories; empty for plans made before it existed.
    packing_items: list[PackingItem] = Field(default_factory=list)


class Activity(BaseModel):
    name: str
    category: ActivityCategory
    description: str
    estimated_cost: float = Field(ge=0, description="USD for the whole group")
    duration: str
    best_time: str
    location: str
    # Multi-city trips: the city the activity is in.
    city: str | None = None


class ActivitiesResult(BaseModel):
    activities: list[Activity]


class Flight(BaseModel):
    airline: str
    departure_airport: str
    arrival_airport: str
    stops: int = Field(ge=0)
    duration: str
    price_per_person: float = Field(ge=0)
    total_price: float = Field(ge=0)
    search_url: str
    # "estimate": the model's estimate; "recent_fare": a real fare other travellers
    # found recently for this route (Travelpayouts cache), with its own dates.
    price_source: Literal["estimate", "recent_fare"] = "estimate"
    departure_at: str | None = None
    return_at: str | None = None


class Hotel(BaseModel):
    name: str
    area: str
    type: str
    rating: float | None = Field(default=None, ge=0, le=5)
    price_per_night: float = Field(ge=0, description="USD per room per night")
    rooms: int
    nights: int
    total_price: float = Field(ge=0)
    amenities: list[str]
    search_url: str
    # Multi-city trips: the stop this hotel is for.
    city: str | None = None


class Transfer(BaseModel):
    """Getting from one city of a multi-city trip to the next."""

    from_city: str
    to_city: str
    date: date
    mode: str
    duration: str
    cost: float = Field(ge=0, description="USD for the whole group")
    notes: str | None = None


class BookingsResult(BaseModel):
    flights: list[Flight]
    hotels: list[Hotel]
    transfers: list[Transfer] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    # Prices come from the model, not a live booking API.
    prices_are_estimates: bool = True


def new_slot_id() -> str:
    return uuid.uuid4().hex[:12]


class Slot(BaseModel):
    # Stable across versions of a trip, so votes and comments stay attached.
    id: str = Field(default_factory=new_slot_id, pattern=r"^[A-Za-z0-9_-]{1,40}$")
    period: Period
    start_time: str
    activity: str
    location: str
    cost: float = Field(ge=0)
    # Approximate coordinates from the model; None if missing or implausible.
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class Meal(BaseModel):
    type: MealType
    suggestion: str
    cuisine: str
    cost: float = Field(ge=0)


class DayPlan(BaseModel):
    day: int
    date: date
    # Multi-city trips: the city this day is spent in.
    city: str | None = None
    theme: str
    slots: list[Slot]
    meals: list[Meal]
    backup_options: list[str] = Field(default_factory=list)
    weather_note: str | None = None
    total_cost: float = Field(ge=0)


class Itinerary(BaseModel):
    days: list[DayPlan]
    highlights: list[str]
    tips: list[str]


class BudgetBreakdown(BaseModel):
    total_budget: float
    flights: float
    lodging: float
    # Multi-city trips: trains, buses or flights between the cities.
    transfers: float = 0
    activities: float
    food: float
    estimated_total: float
    remaining: float
    variance_pct: float = Field(description="Percent over (+) or under (-) budget")
    status: BudgetStatus


class Validation(BaseModel):
    overall_score: int = Field(ge=0, le=100)
    status: ValidationStatus
    category_scores: dict[str, int]
    issues: list[str]
    recommendations: list[str]
    revisions: int = 0


class AgentError(BaseModel):
    agent: AgentName
    message: str
    # True when the failure was Gemini quota/overload, i.e. retrying later may work.
    retryable: bool = False


class TraceStep(BaseModel):
    """One agent run, for the "behind the scenes" view."""

    agent: AgentName
    status: Literal["completed", "failed"]
    started_ms: int = Field(description="Milliseconds after the plan started")
    duration_ms: int
    input_tokens: int = 0
    output_tokens: int = 0
    llm_calls: int = 0
    grounded: bool = False
    sources: int = 0
    detail: str | None = None


class MoneyInfo(BaseModel):
    """Exchange rates frozen at planning time. Rates are units of currency per 1 USD."""

    currency: str
    usd_rate: float = Field(gt=0)
    local_currency: str | None = None
    local_usd_rate: float | None = Field(default=None, gt=0)
    rates_date: str | None = None


class TripSummary(BaseModel):
    destination: str
    stops: list[TripStop] = Field(default_factory=list)
    origin: str | None
    start_date: date
    end_date: date
    days: int
    nights: int
    travelers: int


class TravelPlan(BaseModel):
    id: str
    # "partial" means at least one agent failed and its section is missing.
    status: Literal["complete", "partial"]
    created_at: datetime
    request: TravelRequest
    trip: TripSummary
    research: ResearchResult | None = None
    weather: WeatherResult | None = None
    activities: ActivitiesResult | None = None
    bookings: BookingsResult | None = None
    itinerary: Itinerary | None = None
    budget: BudgetBreakdown
    validation: Validation | None = None
    # None only for plans saved before currencies were supported (then: USD).
    money: MoneyInfo | None = None
    errors: list[AgentError] = Field(default_factory=list)
    # Agent runs for this version, in completion order.
    trace: list[TraceStep] = Field(default_factory=list)
    # Refinement history: each refine creates a new plan linked to its parent.
    version: int = 1
    parent_id: str | None = None
    refinements: list[str] = Field(default_factory=list)
    # The first version's id: votes, comments, members and checklists belong to
    # the trip, not to one version. None on plans saved before it existed.
    root_id: str | None = None
    # User id of the signed-in creator; None for plans made while signed out.
    owner_id: str | None = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    # The full conversation so far, ending with the user's new question.
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def _ends_with_user(self) -> "ChatRequest":
        if self.messages[-1].role != "user":
            raise ValueError("the last message must be from the user")
        return self


class ChatReply(BaseModel):
    answer: str
    # Set when the user asked to change the plan; the UI offers to apply it via refine.
    change_request: str | None = None
    suggestions: list[str] = Field(default_factory=list)
    sources: list[Source] = Field(default_factory=list)


class ItineraryEdit(BaseModel):
    """A hand-edited itinerary. Dates and totals are recomputed by the server."""

    itinerary: Itinerary
    note: str = Field(default="Edited by hand", max_length=200)


class ReplanDayRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=300, description="What changed, e.g. 'heavy rain all day'")

    @field_validator("reason")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 3:
            raise ValueError("reason is too short")
        return value


class RefineRequest(BaseModel):
    instruction: str = Field(min_length=3, max_length=500)

    @field_validator("instruction")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 3:
            raise ValueError("instruction is too short")
        return value
