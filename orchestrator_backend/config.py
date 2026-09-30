"""Application configuration.

Secrets and deployment settings come from the environment (or a local `.env`
file). Agent and validation tuning lives in plain dicts below so it can be
adjusted without touching agent code.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Resolved from this file, so the backend finds its .env whatever directory it's started from.
ENV_FILE = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    # Gemini via Google AI Studio (https://aistudio.google.com/apikey). Required.
    google_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"
    # Used when the main model is overloaded or out of quota. Empty to disable.
    gemini_fallback_model: str = "gemini-3.5-flash-lite"
    # Google Search grounding (live, cited results). Falls back automatically if unavailable.
    enable_grounding: bool = True

    # Optional persistence. Without MongoDB, plans live in memory.
    mongodb_uri: str | None = None
    database_name: str = "travel_orchestrator"

    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    # JSON list or comma-separated: `["https://a.app"]` or `https://a.app,https://b.app`.
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:3000"])

    # Abuse / cost protection for the public planning endpoint.
    rate_limit_per_minute: int = 5
    # Each plan makes ~7 Gemini calls (up to 3 at once); keep this low on the free tier.
    max_concurrent_plans: int = 2
    plan_timeout_seconds: int = 240
    llm_timeout_seconds: int = 90
    max_trip_days: int = 21

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip()
            if value.startswith("["):
                value = json.loads(value)
            else:
                value = value.split(",")
        if isinstance(value, list):
            # Browsers send Origin without a trailing slash.
            return [str(v).strip().rstrip("/") for v in value if str(v).strip()]
        return value

    @property
    def has_llm(self) -> bool:
        return bool(self.google_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()


AGENT_CONFIG = {
    # `thinking` is the Gemini 3 thinking level: more = better reasoning, slower.
    "research_agent": {"temperature": 0.5, "max_tokens": 8000, "thinking": "low"},
    "weather_agent": {"temperature": 0.2, "max_tokens": 8000, "thinking": "low"},
    "activity_agent": {"temperature": 0.8, "max_tokens": 10000, "thinking": "low"},
    "booking_agent": {"temperature": 0.3, "max_tokens": 8000, "thinking": "low"},
    "itinerary_agent": {"temperature": 0.6, "max_tokens": 24000, "thinking": "medium"},
    "validator_agent": {"temperature": 0.1, "max_tokens": 8000, "thinking": "medium"},
    # Used only by the offline evaluation harness (evals/).
    "judge_agent": {"temperature": 0.0, "max_tokens": 4000, "thinking": "low"},
}

VALIDATION_CONFIG = {
    # Status thresholds on the 0-100 overall score.
    "approval_threshold": 75,
    "needs_review_threshold": 60,
    # A plan scoring below this is sent back to the itinerary agent once.
    "revision_threshold": 60,
    "max_revisions": 1,
    # Fraction over budget still reported as "Slightly Over" rather than "Over Budget".
    "budget_tolerance": 0.15,
    # Must sum to 100.
    "weights": {
        "itinerary_quality": 25,
        "budget_feasibility": 20,
        "weather_suitability": 15,
        "activity_diversity": 15,
        "booking_availability": 15,
        "overall_coherence": 10,
    },
}

assert sum(VALIDATION_CONFIG["weights"].values()) == 100, "validation weights must sum to 100"
