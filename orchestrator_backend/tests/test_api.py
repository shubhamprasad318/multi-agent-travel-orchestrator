import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from api.routes import RateLimiter, app
from agents.chat_agent import ChatDraft
from tests.conftest import START, FakeGenerator, default_responses, fake_fx, make_request


@pytest.fixture
def client(settings, monkeypatch):
    monkeypatch.setattr("api.routes.get_settings", lambda: settings)
    with TestClient(app) as test_client:
        responses = default_responses(make_request())
        responses["ChatDraft"] = ChatDraft(answer="Pack an umbrella for day 2.", change_request="", suggestions=["What about day 3?"])
        app.state.generate = FakeGenerator(responses)
        app.state.fx = fake_fx
        yield test_client
        app.state.fx = None


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


def test_plan_in_another_currency(client):
    plan = client.post("/api/v1/plan", json=payload(budget=400000, currency="inr")).json()
    assert plan["request"]["currency"] == "INR" and plan["request"]["budget"] == 400000
    assert plan["money"] == {
        "currency": "INR", "usd_rate": 80.0, "local_currency": "JPY", "local_usd_rate": 150.0, "rates_date": "test-date",
    }
    # Planning happens in USD: 400000 INR / 80 = 5000 USD.
    assert plan["budget"]["total_budget"] == 5000


def test_unsupported_currency_is_rejected(client):
    response = client.post("/api/v1/plan", json=payload(currency="XYZ"))
    assert response.status_code == 422
    assert "XYZ" in response.json()["detail"]


def test_edit_itinerary_moves_a_stop_and_recomputes(client):
    plan = client.post("/api/v1/plan", json=payload()).json()
    itinerary = plan["itinerary"]
    first_date = itinerary["days"][0]["date"]
    moved = itinerary["days"][0]["slots"].pop()
    itinerary["days"][1]["slots"].append({**moved, "cost": 75})
    itinerary["days"][0]["date"] = "1999-01-01"  # ignored: dates come from the trip
    itinerary["days"][0]["total_cost"] = 123456  # ignored: totals are recomputed

    response = client.put(f"/api/v1/plans/{plan['id']}/itinerary", json={"itinerary": itinerary})

    assert response.status_code == 200
    edited = response.json()
    assert edited["version"] == 2 and edited["parent_id"] == plan["id"]
    assert edited["refinements"] == ["Edited by hand"]
    day1, day2 = edited["itinerary"]["days"][:2]
    assert day1["date"] == first_date
    assert day1["total_cost"] == 50 + 30 and day2["total_cost"] == 50 + 50 + 75 + 30
    assert edited["budget"]["activities"] == plan["budget"]["activities"] + 25
    assert [s["agent"] for s in edited["trace"]] == ["validator"]


def test_edit_rejects_an_empty_itinerary(client):
    plan = client.post("/api/v1/plan", json=payload()).json()
    for day in plan["itinerary"]["days"]:
        day["slots"] = []
    response = client.put(f"/api/v1/plans/{plan['id']}/itinerary", json={"itinerary": plan["itinerary"]})
    assert response.status_code == 422


def test_chat_answers_with_plan_context(client):
    plan = client.post("/api/v1/plan", json=payload(budget=400000, currency="INR")).json()
    response = client.post(
        f"/api/v1/plans/{plan['id']}/chat",
        json={"messages": [{"role": "user", "content": "Do I need an umbrella?"}]},
    )
    assert response.status_code == 200
    reply = response.json()
    assert reply["answer"] == "Pack an umbrella for day 2."
    assert reply["change_request"] is None
    prompt = app.state.generate.calls[-1][1]
    assert "Museum 1" in prompt and "INR" in prompt and "Do I need an umbrella?" in prompt


def test_chat_requires_a_user_message_last(client):
    plan = client.post("/api/v1/plan", json=payload()).json()
    response = client.post(f"/api/v1/plans/{plan['id']}/chat", json={"messages": [{"role": "assistant", "content": "hi"}]})
    assert response.status_code == 422


def test_delete_plan(client):
    plan = client.post("/api/v1/plan", json=payload()).json()
    assert client.delete(f"/api/v1/plans/{plan['id']}").status_code == 204
    assert client.get(f"/api/v1/plans/{plan['id']}").status_code == 404
    assert client.delete(f"/api/v1/plans/{plan['id']}").status_code == 404
