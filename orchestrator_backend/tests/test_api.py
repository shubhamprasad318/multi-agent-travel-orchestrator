import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from api.routes import RateLimiter, app
from tests.conftest import START, FakeGenerator, default_responses, make_request


@pytest.fixture
def client(settings, monkeypatch):
    monkeypatch.setattr("api.routes.get_settings", lambda: settings)
    with TestClient(app) as test_client:
        app.state.generate = FakeGenerator(default_responses(make_request()))
        yield test_client


def payload(**overrides):
    body = {
        "destination": "Tokyo, Japan",
        "origin": "San Francisco",
        "start_date": START.isoformat(),
        "end_date": (START + timedelta(days=2)).isoformat(),
        "budget": 5000,
        "travelers": 2,
        "preferences": {"interests": ["food"], "pace": "moderate", "accommodation": "mid-range"},
    }
    body.update(overrides)
    return body


def test_health(client):
    data = client.get("/health").json()
    assert data["status"] == "healthy"
    assert data["storage"] == "memory"
    assert data["model"].startswith("gemini-")


def test_create_and_fetch_plan(client):
    response = client.post("/api/v1/plan", json=payload())
    assert response.status_code == 200
    plan = response.json()
    assert plan["status"] == "complete"

    fetched = client.get(f"/api/v1/plans/{plan['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == plan["id"]


def test_unknown_plan_is_404(client):
    assert client.get("/api/v1/plans/" + "0" * 32).status_code == 404
    assert client.get("/api/v1/plans/not-an-id").status_code == 404


def test_validation_errors_are_readable(client):
    response = client.post("/api/v1/plan", json=payload(end_date=(START - timedelta(days=1)).isoformat()))
    assert response.status_code == 422
    assert "end_date must be on or after start_date" in response.json()["detail"]


def test_stream_emits_progress_then_result(client):
    with client.stream("POST", "/api/v1/plan/stream", json=payload()) as response:
        assert response.status_code == 200
        body = "".join(response.iter_text())

    events = [
        (block.split("\n")[0].removeprefix("event: "), json.loads(block.split("\n")[1].removeprefix("data: ")))
        for block in body.strip().split("\n\n")
        if block.startswith("event:")
    ]
    kinds = [kind for kind, _ in events]
    assert kinds[-1] == "result"
    assert "progress" in kinds
    assert events[-1][1]["itinerary"]["days"]


def test_rate_limit(client):
    app.state.limiter = RateLimiter(per_minute=1)
    assert client.post("/api/v1/plan", json=payload()).status_code == 200
    assert client.post("/api/v1/plan", json=payload()).status_code == 429


def test_no_llm_key_returns_503(client):
    app.state.settings = app.state.settings.model_copy(update={"google_api_key": None})
    response = client.post("/api/v1/plan", json=payload())
    assert response.status_code == 503


def test_refine_creates_linked_version(client):
    plan = client.post("/api/v1/plan", json=payload()).json()

    response = client.post(f"/api/v1/plans/{plan['id']}/refine", json={"instruction": "  make day 2   more relaxed "})

    assert response.status_code == 200
    refined = response.json()
    assert refined["id"] != plan["id"]
    assert refined["parent_id"] == plan["id"]
    assert refined["version"] == 2
    assert refined["refinements"] == ["make day 2 more relaxed"]
    prompt = [user for key, user in app.state.generate.calls if key == "itinerary_agent"][-1]
    assert "make day 2 more relaxed" in prompt and "Current itinerary" in prompt
    # The original stays retrievable alongside the new version.
    assert client.get(f"/api/v1/plans/{plan['id']}").json()["version"] == 1
    assert client.get(f"/api/v1/plans/{refined['id']}").json()["version"] == 2


def test_refine_works_after_trip_dates_pass(client):
    plan = client.post("/api/v1/plan", json=payload()).json()
    stored = app.state.store._data["plans"][plan["id"]][1]
    stored["request"]["start_date"] = "2020-01-01"
    stored["request"]["end_date"] = "2020-01-03"
    assert client.post(f"/api/v1/plans/{plan['id']}/refine", json={"instruction": "more food"}).status_code == 200


def test_refine_validates_input(client):
    plan = client.post("/api/v1/plan", json=payload()).json()
    assert client.post(f"/api/v1/plans/{plan['id']}/refine", json={"instruction": "x"}).status_code == 422
    assert client.post("/api/v1/plans/" + "0" * 32 + "/refine", json={"instruction": "more food"}).status_code == 404


def test_server_starts_without_a_key(monkeypatch):
    # Real startup path (real Gemini generator), just with no key configured.
    from config import Settings

    keyless = Settings(_env_file=None, google_api_key=None)
    monkeypatch.setattr("api.routes.get_settings", lambda: keyless)
    with TestClient(app) as test_client:
        health = test_client.get("/health").json()
        assert health["status"] == "degraded" and health["llm_configured"] is False
        response = test_client.post("/api/v1/plan", json=payload())
        assert response.status_code == 503
        assert "GOOGLE_API_KEY" in response.json()["detail"]
