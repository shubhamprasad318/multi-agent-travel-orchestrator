"""API contract shared by the orchestrator, the HTTP layer and (mirrored in
`frontend/lib/types.ts`) the frontend.

All money values are USD totals for the whole travelling group unless the
field name says otherwise (e.g. `price_per_person`, `price_per_night`).
"""

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
AgentName = Literal["research", "weather", "activity", "booking", "itinerary", "validator", "revision"]


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


class TravelRequest(BaseModel):
    # Older clients also send `duration`; it is derived from the dates here.
    model_config = ConfigDict(extra="ignore")

    destination: str = Field(min_length=2, max_length=100)
    origin: str | None = Field(default=None, max_length=100)
    start_date: date
    end_date: date
    budget: float = Field(gt=0, le=1_000_000, description="Total budget in USD for the whole group")
    travelers: int = Field(ge=1, le=10)
    preferences: Preferences = Field(default_factory=Preferences)

    @field_validator("destination", "origin")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = " ".join(value.split())
        return value or None

    @model_validator(mode="after")
    def _check_dates(self, info: ValidationInfo) -> "TravelRequest":
        if not self.destination or len(self.destination) < 2:
            raise ValueError("destination is required")
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
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
    sources: list[Source] = Field(default_factory=list)


class WeatherDay(BaseModel):
    date: date
    condition: str
    temp_min_c: float
    temp_max_c: float
    precip_chance: int | None = Field(default=None, ge=0, le=100)


class WeatherResult(BaseModel):
    # "forecast": live API data for every day; "climate_estimate": model
    # knowledge of typical conditions; "mixed": some of each.
    source: Literal["forecast", "climate_estimate", "mixed"]
    summary: str
    days: list[WeatherDay]
    packing_list: list[str]
    advisories: list[str] = Field(default_factory=list)


class Activity(BaseModel):
    name: str
    category: ActivityCategory
    description: str
    estimated_cost: float = Field(ge=0, description="USD for the whole group")
    duration: str
    best_time: str
    location: str


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


class BookingsResult(BaseModel):
    flights: list[Flight]
    hotels: list[Hotel]
    notes: list[str] = Field(default_factory=list)
    # Prices come from the model, not a live booking API.
    prices_are_estimates: bool = True


class Slot(BaseModel):
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


class TripSummary(BaseModel):
    destination: str
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
    errors: list[AgentError] = Field(default_factory=list)
    # Agent runs for this version, in completion order.
    trace: list[TraceStep] = Field(default_factory=list)
    # Refinement history: each refine creates a new plan linked to its parent.
    version: int = 1
    parent_id: str | None = None
    refinements: list[str] = Field(default_factory=list)


class RefineRequest(BaseModel):
    instruction: str = Field(min_length=3, max_length=500)

    @field_validator("instruction")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 3:
            raise ValueError("instruction is too short")
        return value
