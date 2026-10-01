"""The real Gemini generator's retry / fallback policy, with a scripted fake client."""

import pytest
from pydantic import BaseModel

from agents.base import LLMUnavailableError, gemini_generator
from config import Settings
from orchestrator import PlanningError, create_plan
from tests.conftest import make_request
from utils.models import ModelPool, parse_quota_error, seconds_until_quota_reset


class Answer(BaseModel):
    text: str


class ApiError(Exception):
    def __init__(self, code: int, quota_id: str | None = None, retry_delay: str | None = None) -> None:
        super().__init__(f"HTTP {code}")
        self.code = code
        # The shape google.genai gives a 429: QuotaFailure and RetryInfo details.
        details = []
        if quota_id:
            details.append({"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{"quotaId": quota_id}]})
        if retry_delay:
            details.append({"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": retry_delay})
        self.details = {"error": {"code": code, "details": details}}


DAILY = ApiError(429, "GenerateRequestsPerDayPerProjectPerModel-FreeTier", "43s")
PER_MINUTE = ApiError(429, "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "20s")


class FakeResponse:
    def __init__(self) -> None:
        self.parsed = Answer(text="ok")
        self.text = '{"text": "ok"}'
        self.candidates = []
        self.usage_metadata = None


class ScriptedClient:
    """Each call pops the next outcome: an int status code (raised) or "ok"."""

    def __init__(self, outcomes: list) -> None:
        self.outcomes = list(outcomes)
        self.calls: list[tuple[str, bool]] = []
        self.aio = self
        self.models = self

    async def generate_content(self, model, contents, config):
        self.calls.append((model, bool(config.tools)))
        outcome = self.outcomes.pop(0)
        if outcome == "ok":
            return FakeResponse()
        raise outcome if isinstance(outcome, Exception) else ApiError(outcome)


async def _no_sleep(_seconds: float) -> None:
    return None


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def _generator(outcomes: list, pool: ModelPool | None = None, **settings_overrides):
    settings_overrides.setdefault("gemini_fallback_models", [])
    settings = Settings(_env_file=None, google_api_key="test", **settings_overrides)
    client = ScriptedClient(outcomes)
    return gemini_generator(settings, client=client, sleep=_no_sleep, pool=pool), client, settings


async def test_search_quota_on_one_model_moves_search_to_the_next_model():
    pool = ModelPool(["main", "lite"], clock=Clock())
    generate, client, _ = _generator([429, "ok", "ok"], pool=pool, gemini_model="main", gemini_fallback_model="lite")

    assert (await generate("research_agent", Answer, "sys", "user", grounded=True)).text == "ok"
    # During the cooldown the next grounded call goes straight to the model that can still search.
    await generate("activity_agent", Answer, "sys", "user", grounded=True)

    assert client.calls == [("main", True), ("lite", True), ("lite", True)]


async def test_without_any_search_left_grounded_calls_go_ungrounded():
    pool = ModelPool(["main", "lite"], clock=Clock())
    generate, client, _ = _generator([429, 429, "ok"], pool=pool, gemini_model="main", gemini_fallback_model="lite")
    await generate("research_agent", Answer, "sys", "user", grounded=True)
    assert client.calls == [("main", True), ("lite", True), ("main", False)]


async def test_overloaded_primary_falls_back_to_lite_model():
    generate, client, settings = _generator([503, 503, "ok"])
    assert (await generate("itinerary_agent", Answer, "sys", "user")).text == "ok"
    assert [model for model, _ in client.calls] == [settings.gemini_model, settings.gemini_model, settings.gemini_fallback_model]


async def test_exhausted_quota_raises_a_user_friendly_error():
    generate, _, _ = _generator([DAILY, DAILY])
    with pytest.raises(LLMUnavailableError, match="quota"):
        await generate("itinerary_agent", Answer, "sys", "user")


async def test_non_retryable_errors_are_raised_immediately():
    generate, client, _ = _generator([400])
    with pytest.raises(ApiError):
        await generate("itinerary_agent", Answer, "sys", "user")
    assert len(client.calls) == 1


async def test_plan_failure_explains_quota_to_the_user(make_ctx):
    request = make_request()
    quota = LLMUnavailableError("Your Gemini API quota is used up for now.")
    ctx, _ = make_ctx(request, ItineraryDraft=quota, ResearchDraft=quota)
    with pytest.raises(PlanningError, match="quota is used up"):
        await create_plan(ctx, request)


async def test_daily_quota_skips_to_the_next_model_without_waiting_and_rests_the_model():
    models = ["main", "second", "lite"]
    pool = ModelPool(models, clock=Clock())
    generate, client, _ = _generator(
        [DAILY, "ok", "ok"], pool=pool, gemini_model="main", gemini_fallback_models=["second"], gemini_fallback_model="lite"
    )
    await generate("itinerary_agent", Answer, "sys", "user")
    # The exhausted model isn't tried again on the next call.
    await generate("validator_agent", Answer, "sys", "user")
    assert [model for model, _ in client.calls] == ["main", "second", "second"]
    main = next(row for row in pool.status() if row["model"] == "main")
    assert main["available"] is False and main["reason"] == "daily quota used up"


async def test_per_minute_quota_rests_the_model_only_for_the_retry_delay():
    clock = Clock()
    pool = ModelPool(["main", "lite"], clock=clock)
    generate, client, _ = _generator([PER_MINUTE, "ok", "ok"], pool=pool, gemini_model="main", gemini_fallback_model="lite")
    await generate("itinerary_agent", Answer, "sys", "user")
    clock.now += 21
    await generate("itinerary_agent", Answer, "sys", "user")
    assert [model for model, _ in client.calls] == ["main", "lite", "main"]


async def test_unknown_model_is_dropped_from_the_chain():
    pool = ModelPool(["main", "old", "lite"], clock=Clock())
    generate, client, _ = _generator(
        [DAILY, 404, "ok", "ok"], pool=pool, gemini_model="main", gemini_fallback_models=["old"], gemini_fallback_model="lite"
    )
    await generate("itinerary_agent", Answer, "sys", "user")
    await generate("itinerary_agent", Answer, "sys", "user")
    assert [model for model, _ in client.calls] == ["main", "old", "lite", "lite"]


async def test_grounding_refused_on_one_model_keeps_it_on_for_others():
    pool = ModelPool(["main", "lite"], clock=Clock())
    generate, client, _ = _generator([400, "ok"], pool=pool, gemini_model="main", gemini_fallback_model="lite")
    await generate("research_agent", Answer, "sys", "user", grounded=True)
    assert client.calls == [("main", True), ("lite", True)]
    assert pool.can_ground("lite") and not pool.can_ground("main")


def test_quota_errors_are_parsed():
    daily = parse_quota_error(DAILY)
    assert daily.daily and not daily.grounding and daily.retry_after == 43
    assert not parse_quota_error(PER_MINUTE).daily
    assert parse_quota_error(ApiError(429)).retry_after is None


def test_daily_quota_resets_at_midnight_pacific():
    from datetime import datetime

    from utils.models import QUOTA_TZ

    late = datetime(2026, 10, 1, 23, 0, tzinfo=QUOTA_TZ)
    assert 3600 <= seconds_until_quota_reset(late) <= 3700


async def test_identical_requests_are_answered_from_the_cache():
    from agents.base import cached_generator
    from utils.store import MemoryStore

    generate, client, _ = _generator(["ok", "ok", "ok"])
    cached = cached_generator(generate, MemoryStore())
    await cached("research_agent", Answer, "sys", "same trip", grounded=True)
    assert (await cached("research_agent", Answer, "sys", "same trip", grounded=True)).text == "ok"
    await cached("research_agent", Answer, "sys", "another trip", grounded=True)
    # Itineraries are never cached.
    await cached("itinerary_agent", Answer, "sys", "same trip")
    assert len(client.calls) == 3
