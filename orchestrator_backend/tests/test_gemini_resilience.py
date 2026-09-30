"""The real Gemini generator's retry / fallback policy, with a scripted fake client."""

import pytest
from pydantic import BaseModel

from agents.base import LLMUnavailableError, gemini_generator
from config import Settings
from orchestrator import PlanningError, create_plan
from tests.conftest import make_request


class Answer(BaseModel):
    text: str


class ApiError(Exception):
    def __init__(self, code: int) -> None:
        super().__init__(f"HTTP {code}")
        self.code = code


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
        raise ApiError(outcome)


async def _no_sleep(_seconds: float) -> None:
    return None


def _generator(outcomes: list, **settings_overrides):
    settings = Settings(_env_file=None, google_api_key="test", **settings_overrides)
    client = ScriptedClient(outcomes)
    return gemini_generator(settings, client=client, sleep=_no_sleep), client, settings


async def test_grounding_quota_falls_back_to_ungrounded_and_pauses_grounding():
    generate, client, settings = _generator([429, "ok", "ok"])

    assert (await generate("research_agent", Answer, "sys", "user", grounded=True)).text == "ok"
    # Next grounded call skips grounding during the cooldown.
    await generate("activity_agent", Answer, "sys", "user", grounded=True)

    assert client.calls == [
        (settings.gemini_model, True),
        (settings.gemini_model, False),
        (settings.gemini_model, False),
    ]


async def test_overloaded_primary_falls_back_to_lite_model():
    generate, client, settings = _generator([503, 503, "ok"])
    assert (await generate("itinerary_agent", Answer, "sys", "user")).text == "ok"
    assert [model for model, _ in client.calls] == [settings.gemini_model, settings.gemini_model, settings.gemini_fallback_model]


async def test_exhausted_quota_raises_a_user_friendly_error():
    generate, _, _ = _generator([429, 429, 429, 429])
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
