"""Recent real flight fares from the Travelpayouts (Aviasales) Data API. Optional and free.

These are not live prices: they are fares other travellers found in searches
over the last few days, cached by Aviasales. They are shown labelled as
"recent fares" next to the booking agent's estimates, and anything that goes
wrong (no token, no data for the route, API down) just means no fares.
Docs: https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Awaitable, Callable

import httpx

from utils.logger import get_logger
from utils.store import Store

logger = get_logger(__name__)

PRICES_URL = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates"
AVIASALES_URL = "https://www.aviasales.com"
CACHE_TTL_SECONDS = 6 * 3600
# Fares for nearby dates still say a lot about the price level.
MAX_DATE_SHIFT_DAYS = 3
MAX_LENGTH_DIFF_DAYS = 2


@dataclass(frozen=True)
class Fare:
    """A round-trip economy fare per adult, in USD."""

    airline: str
    origin_airport: str
    destination_airport: str
    price: float
    transfers: int
    duration_minutes: int | None
    departure_at: str
    return_at: str | None
    link: str


# (origin IATA, destination IATA, departure date, return date) -> fares, cheapest first.
FareLookup = Callable[[str, str, date, date], Awaitable[list[Fare]]]


def _parse_date(value: Any) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def parse_fares(data: dict[str, Any], depart: date, back: date, marker: str | None = None) -> list[Fare]:
    """Fares from an API response that roughly match the trip's dates, cheapest first."""
    fares = []
    for row in data.get("data") or []:
        if not isinstance(row, dict):
            continue
        out, ret = _parse_date(row.get("departure_at")), _parse_date(row.get("return_at"))
        price = row.get("price")
        if out is None or ret is None or not isinstance(price, (int, float)) or price <= 0:
            continue
        if abs((out - depart).days) > MAX_DATE_SHIFT_DAYS:
            continue
        if abs((ret - out).days - (back - depart).days) > MAX_LENGTH_DIFF_DAYS:
            continue
        link = row.get("link") if isinstance(row.get("link"), str) and str(row.get("link")).startswith("/") else None
        url = f"{AVIASALES_URL}{link}" if link else AVIASALES_URL
        if marker:
            url += ("&" if "?" in url else "?") + f"marker={marker}"
        duration = row.get("duration_to") or row.get("duration")
        fares.append(
            Fare(
                airline=str(row.get("airline") or "Airline"),
                origin_airport=str(row.get("origin_airport") or row.get("origin") or ""),
                destination_airport=str(row.get("destination_airport") or row.get("destination") or ""),
                price=float(price),
                transfers=int(row.get("transfers") or 0),
                duration_minutes=int(duration) if isinstance(duration, (int, float)) and duration > 0 else None,
                departure_at=out.isoformat(),
                return_at=ret.isoformat(),
                link=url,
            )
        )
    return sorted(fares, key=lambda f: f.price)


def travelpayouts_lookup(token: str, store: Store, marker: str | None = None) -> FareLookup:
    async def fetch(params: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(PRICES_URL, params=params, headers={"X-Access-Token": token})
            response.raise_for_status()
            return response.json()

    async def lookup(origin: str, destination: str, depart: date, back: date) -> list[Fare]:
        origin, destination = origin.strip().upper(), destination.strip().upper()
        if len(origin) != 3 or len(destination) != 3 or not (origin + destination).isalpha():
            return []
        key = f"{origin}-{destination}-{depart.isoformat()}-{back.isoformat()}"
        if cached := await store.get("fares", key):
            return parse_fares(cached, depart, back, marker)
        base = {"origin": origin, "destination": destination, "currency": "usd", "sorting": "price", "one_way": "false", "limit": 30}
        try:
            # Exact dates first; if nobody searched them, the months around them.
            data = await fetch({**base, "departure_at": depart.isoformat(), "return_at": back.isoformat()})
            if not parse_fares(data, depart, back):
                data = await fetch({**base, "departure_at": depart.strftime("%Y-%m"), "return_at": back.strftime("%Y-%m")})
        except Exception as exc:  # noqa: BLE001 - fares are a bonus; estimates remain
            logger.warning("Travelpayouts fares unavailable: %s", exc)
            return []
        await store.set("fares", key, data, ttl=CACHE_TTL_SECONDS)
        return parse_fares(data, depart, back, marker)

    return lookup
