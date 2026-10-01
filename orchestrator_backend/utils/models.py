"""Which Gemini models can take a call right now.

The free tier gives every model its own quota (requests per minute and per
day). When one model's quota runs out, the next model in the chain is tried
at once, and the exhausted model is skipped until its quota resets instead of
being retried (and failing) on every call. A model the key can't use (404, or
not supported) is dropped for the life of the process.
"""

import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable
from zoneinfo import ZoneInfo

# Free-tier daily quotas reset at midnight Pacific time.
QUOTA_TZ = ZoneInfo("America/Los_Angeles")
DEFAULT_MINUTE_COOLDOWN = 60.0


@dataclass
class QuotaError:
    """What a 429 said: which quota ran out and when to retry."""

    daily: bool
    grounding: bool
    retry_after: float | None


def parse_quota_error(exc: Any) -> QuotaError:
    """Reads google.genai's 429 details (QuotaFailure / RetryInfo); unknown shapes give a plain per-minute error."""
    details = getattr(exc, "details", None)
    error = details.get("error", {}) if isinstance(details, dict) else {}
    quota_ids: list[str] = []
    retry_after: float | None = None
    for detail in error.get("details", []) if isinstance(error, dict) else []:
        kind = str(detail.get("@type", ""))
        if kind.endswith("QuotaFailure"):
            quota_ids += [str(v.get("quotaId", "")) for v in detail.get("violations", [])]
        elif kind.endswith("RetryInfo"):
            delay = str(detail.get("retryDelay", "")).rstrip("s")
            try:
                retry_after = float(delay)
            except ValueError:
                pass
    joined = " ".join(quota_ids).lower()
    return QuotaError(
        daily="perday" in joined,
        grounding="search" in joined or "grounding" in joined,
        retry_after=retry_after,
    )


def seconds_until_quota_reset(now: datetime | None = None) -> float:
    now = (now or datetime.now(QUOTA_TZ)).astimezone(QUOTA_TZ)
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    # A minute's margin: quotas don't all reset on the exact second.
    return (midnight - now).total_seconds() + 60


@dataclass
class ModelPool:
    """The model chain, in preference order, with each model's cooldown."""

    models: list[str]
    clock: Callable[[], float] = time.monotonic
    _resting_until: dict[str, float] = field(default_factory=dict)
    _reason: dict[str, str] = field(default_factory=dict)
    _dropped: set[str] = field(default_factory=set)
    # Models whose grounded calls were refused (400/403): called without Google Search.
    _no_grounding: set[str] = field(default_factory=set)
    # Models whose Google Search quota ran out, until when.
    _grounding_resting_until: dict[str, float] = field(default_factory=dict)

    def available(self) -> list[str]:
        now = self.clock()
        return [m for m in self.models if m not in self._dropped and self._resting_until.get(m, 0.0) <= now]

    def rest(self, model: str, seconds: float, reason: str) -> None:
        self._resting_until[model] = self.clock() + seconds
        self._reason[model] = reason

    def rest_after_quota(self, model: str, quota: QuotaError) -> None:
        if quota.daily:
            self.rest(model, seconds_until_quota_reset(), "daily quota used up")
        else:
            self.rest(model, quota.retry_after or DEFAULT_MINUTE_COOLDOWN, "rate limited")

    def drop(self, model: str, reason: str) -> None:
        self._dropped.add(model)
        self._reason[model] = reason

    def can_ground(self, model: str) -> bool:
        return model not in self._no_grounding and self._grounding_resting_until.get(model, 0.0) <= self.clock()

    def disable_grounding(self, model: str) -> None:
        self._no_grounding.add(model)

    def rest_grounding(self, model: str, seconds: float) -> None:
        self._grounding_resting_until[model] = self.clock() + seconds

    def status(self) -> list[dict[str, Any]]:
        """For /health: each model and, when it can't be used, why and for how long."""
        now = self.clock()
        rows = []
        for model in self.models:
            if model in self._dropped:
                rows.append({"model": model, "available": False, "reason": self._reason.get(model)})
                continue
            wait = self._resting_until.get(model, 0.0) - now
            row: dict[str, Any] = {"model": model, "available": wait <= 0, "grounding": self.can_ground(model)}
            if wait > 0:
                row.update(reason=self._reason.get(model), retry_in_seconds=round(wait))
            rows.append(row)
        return rows
