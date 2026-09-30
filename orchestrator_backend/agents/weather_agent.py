from datetime import date, timedelta

from pydantic import BaseModel, Field

from agents.base import SYSTEM_BASE, AgentContext, user_input
from schemas import TravelRequest, WeatherDay, WeatherResult

# Published forecasts are only meaningful about this far ahead.
FORECAST_HORIZON_DAYS = 10


class DayDraft(BaseModel):
    date: str = Field(description="ISO date, YYYY-MM-DD")
    condition: str
    temp_min_c: float
    temp_max_c: float
    precip_chance: int = Field(description="0-100")
    is_forecast: bool = Field(description="true only if taken from a published forecast found via search")


class WeatherDraft(BaseModel):
    summary: str
    days: list[DayDraft]
    packing_list: list[str]
    advisories: list[str]


SYSTEM = SYSTEM_BASE + (
    " You are a weather analyst. When the trip is within the forecast horizon, use Google "
    "Search to find the current published forecast for each date and mark those days "
    "is_forecast=true. For every other date give TYPICAL conditions for that place and time "
    "of year (climate averages) with is_forecast=false — never present averages as a forecast. "
    "Write a 1-2 sentence summary, 8-12 practical packing items, and advisories only for real "
    "seasonal risks (monsoon, typhoon season, extreme heat, snow closures)."
)


async def run(ctx: AgentContext, request: TravelRequest, today: date | None = None) -> WeatherResult:
    today = today or date.today()
    trip_dates = [request.start_date + timedelta(days=i) for i in range(request.days)]
    within_horizon = request.start_date <= today + timedelta(days=FORECAST_HORIZON_DAYS)
    user = (
        f"Destination: {user_input(request.destination)}\n"
        f"Today: {today.isoformat()}\n"
        f"Give one entry for each of these dates: {', '.join(d.isoformat() for d in trip_dates)}\n"
        + (
            "Some dates are within the forecast horizon: search for the latest forecast."
            if within_horizon
            else "All dates are beyond the forecast horizon: use climate averages only."
        )
    )
    draft = await ctx.generate("weather_agent", WeatherDraft, SYSTEM, user, grounded=within_horizon)

    wanted = set(trip_dates)
    days: dict[date, tuple[WeatherDay, bool]] = {}
    for d in draft.days:
        try:
            day_date = date.fromisoformat(d.date)
        except ValueError:
            continue
        if day_date in wanted and day_date not in days:
            days[day_date] = (
                WeatherDay(
                    date=day_date,
                    condition=d.condition,
                    temp_min_c=d.temp_min_c,
                    temp_max_c=d.temp_max_c,
                    precip_chance=max(0, min(100, d.precip_chance)),
                ),
                # Forecast claims are only trusted when the model could actually search.
                d.is_forecast and within_horizon,
            )

    forecast_flags = [is_forecast for _, is_forecast in days.values()]
    if forecast_flags and all(forecast_flags) and len(days) == len(trip_dates):
        source = "forecast"
    elif any(forecast_flags):
        source = "mixed"
    else:
        source = "climate_estimate"

    return WeatherResult(
        source=source,
        summary=draft.summary,
        days=[day for _, (day, _) in sorted(days.items())],
        packing_list=draft.packing_list,
        advisories=draft.advisories,
    )
