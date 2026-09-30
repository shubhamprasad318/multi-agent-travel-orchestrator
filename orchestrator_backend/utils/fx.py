"""Exchange rates from open.er-api.com (free, no key, updated daily).

Rates are "units of currency per 1 USD". They're cached in the store for
12 hours so each plan doesn't hit the API.
"""

import httpx

from utils.logger import get_logger
from utils.store import Store

logger = get_logger(__name__)

RATES_URL = "https://open.er-api.com/v6/latest/USD"
CACHE_TTL_SECONDS = 12 * 3600
# Largest budget we plan for, in USD, whatever currency it's given in.
MAX_BUDGET_USD = 1_000_000


class FxUnavailableError(RuntimeError):
    """Rates couldn't be loaded. The message is safe to show users."""


class UnsupportedCurrencyError(ValueError):
    pass


async def fetch_rates(store: Store) -> tuple[dict[str, float], str | None]:
    """Returns (rates, date). Raises FxUnavailableError if they can't be loaded."""
    if cached := await store.get("fx", "USD"):
        return cached["rates"], cached.get("date")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(RATES_URL)
            response.raise_for_status()
            data = response.json()
        if data.get("result") != "success" or not data.get("rates"):
            raise ValueError(f"unexpected response: {data.get('result')}")
    except Exception as exc:  # noqa: BLE001 - any failure means no rates
        logger.warning("Exchange rates unavailable: %s", exc)
        raise FxUnavailableError("Couldn't load exchange rates right now. Try again, or plan in USD.") from exc
    rates = {code.upper(): float(rate) for code, rate in data["rates"].items() if rate}
    rates["USD"] = 1.0
    date = data.get("time_last_update_utc")
    await store.set("fx", "USD", {"rates": rates, "date": date}, ttl=CACHE_TTL_SECONDS)
    return rates, date


def rate_for(rates: dict[str, float], currency: str) -> float:
    rate = rates.get(currency.upper())
    if not rate or rate <= 0:
        raise UnsupportedCurrencyError(f"Currency {currency} is not supported.")
    return rate
