import json

import pytest
from fastapi.testclient import TestClient

from agents.replan_agent import ReplanDraft
from api import evals as evals_api
from api.routes import app
from tests.conftest import FakeGenerator, default_responses, fake_fx, make_request
from tests.test_api import payload
from tests.test_replan import rainy_day
from utils.auth import AuthError, GoogleIdentity, SessionSigner


async def fake_google(token: str) -> GoogleIdentity:
    if not token.startswith("google-token-"):
        raise AuthError("Google sign-in failed. Please try again.")
    name = token.removeprefix("google-token-").split("-")[0]
    return GoogleIdentity(sub=f"sub-{name}", email=f"{name}@example.com", name=name.title(), picture=None)


@pytest.fixture
def client(settings, monkeypatch):
    settings = settings.model_copy(update={"google_client_id": "test-client.apps.googleusercontent.com", "auth_secret": "s" * 40})
    monkeypatch.setattr("api.routes.get_settings", lambda: settings)
    with TestClient(app) as test_client:
        responses = default_responses(make_request())
        responses["ReplanDraft"] = rainy_day()
        app.state.generate = FakeGenerator(responses)
        app.state.fx = fake_fx
        app.state.verify_google = fake_google
        yield test_client
        app.state.fx = None


def sign_in(client, name: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/google", json={"credential": f"google-token-{name}-xxxxxxxxxxxx"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_sign_in_and_profile(client):
    assert client.get("/api/v1/auth/config").json() == {"enabled": True, "google_client_id": "test-client.apps.googleusercontent.com"}
    headers = sign_in(client, "alice")
    me = client.get("/api/v1/me", headers=headers).json()
    assert me["name"] == "Alice" and me["email"] == "alice@example.com"
    # Same Google account, same user id.
    assert client.get("/api/v1/me", headers=sign_in(client, "alice")).json()["id"] == me["id"]

    assert client.get("/api/v1/me").status_code == 401
    assert client.get("/api/v1/me", headers={"Authorization": "Bearer nonsense.token"}).status_code == 401
    assert client.post("/api/v1/auth/google", json={"credential": "not-a-google-token-at-all"}).status_code == 401


def test_session_tokens_expire_and_resist_tampering():
    signer = SessionSigner("secret" * 8, days=1)
    token = signer.issue("user-1", now=1000)
    assert signer.verify(token, now=1000 + 3600) == "user-1"
    with pytest.raises(AuthError, match="expired"):
        signer.verify(token, now=1000 + 2 * 86400)
    payload_part, signature = token.split(".")
    with pytest.raises(AuthError):
        signer.verify(f"{payload_part}x.{signature}")
    with pytest.raises(AuthError):
        SessionSigner("another-secret" * 4, days=1).verify(token)


def test_signed_in_plans_belong_to_their_owner(client):
    alice, bob = sign_in(client, "alice"), sign_in(client, "bob")
    plan = client.post("/api/v1/plan", json=payload(), headers=alice).json()
    assert plan["owner_id"] and plan["root_id"] == plan["id"]

    trips = client.get("/api/v1/me/trips", headers=alice).json()
    assert [(t["id"], t["role"]) for t in trips] == [(plan["id"], "owner")]
    assert client.get("/api/v1/me/trips", headers=bob).json() == []

    # Anyone with the link can look, but only the owner (and invited friends) can change it.
    assert client.get(f"/api/v1/plans/{plan['id']}").status_code == 200
    refine = {"instruction": "more food please"}
    assert client.post(f"/api/v1/plans/{plan['id']}/refine", json=refine).status_code == 401
    assert client.post(f"/api/v1/plans/{plan['id']}/refine", json=refine, headers=bob).status_code == 403
    assert client.delete(f"/api/v1/plans/{plan['id']}", headers=bob).status_code == 403
    refined = client.post(f"/api/v1/plans/{plan['id']}/refine", json=refine, headers=alice).json()
    assert refined["owner_id"] == plan["owner_id"] and refined["root_id"] == plan["id"]
    assert {t["id"] for t in client.get("/api/v1/me/trips", headers=alice).json()} == {plan["id"], refined["id"]}


def test_planning_together(client):
    alice, bob, carol = sign_in(client, "alice"), sign_in(client, "bob"), sign_in(client, "carol")
    plan = client.post("/api/v1/plan", json=payload(), headers=alice).json()
    pid = plan["id"]
    slot_id = plan["itinerary"]["days"][0]["slots"][0]["id"]

    viewer = client.get(f"/api/v1/plans/{pid}/collab", headers=bob).json()
    assert viewer["role"] == "viewer" and not viewer["can_edit"] and viewer["owner"]["name"] == "Alice"
    assert viewer["members"] == [] and viewer["votes"] == {} and viewer["invite_code"] is None
    assert client.put(f"/api/v1/plans/{pid}/votes/{slot_id}", json={"value": 1}, headers=bob).status_code == 403
    assert client.post(f"/api/v1/plans/{pid}/invite", headers=bob).status_code == 403

    code = client.post(f"/api/v1/plans/{pid}/invite", headers=alice).json()["invite_code"]
    assert client.post(f"/api/v1/plans/{pid}/join", json={"code": "wrong-code"}, headers=bob).status_code == 403
    joined = client.post(f"/api/v1/plans/{pid}/join", json={"code": code}, headers=bob).json()
    assert joined["role"] == "member" and joined["invite_code"] is None
    assert [(m["name"], m["role"]) for m in joined["members"]] == [("Alice", "owner"), ("Bob", "member")]

    # Members vote, comment and change the plan; the trip shows in their list.
    tally = client.put(f"/api/v1/plans/{pid}/votes/{slot_id}", json={"value": 1}, headers=bob).json()
    assert (tally["up"], tally["mine"], tally["up_names"]) == (1, 1, ["Bob"])
    client.put(f"/api/v1/plans/{pid}/votes/{slot_id}", json={"value": -1}, headers=alice)
    comment = client.post(f"/api/v1/plans/{pid}/comments", json={"slot_id": slot_id, "text": " Love this! "}, headers=bob).json()
    assert comment["text"] == "Love this!" and comment["author"]["name"] == "Bob"
    assert client.post(f"/api/v1/plans/{pid}/comments", json={"slot_id": "nope", "text": "hi"}, headers=bob).status_code == 404
    replanned = client.post(f"/api/v1/plans/{pid}/days/1/replan", json={"reason": "rain"}, headers=bob)
    assert replanned.status_code == 200
    assert [t["role"] for t in client.get("/api/v1/me/trips", headers=bob).json()] == ["member", "member"]

    # Votes and comments belong to the trip, so the new version shows them too.
    new_version = replanned.json()["id"]
    collab = client.get(f"/api/v1/plans/{new_version}/collab", headers=alice).json()
    assert collab["role"] == "owner" and collab["invite_code"] == code
    assert collab["votes"][slot_id]["up"] == 1 and collab["votes"][slot_id]["down"] == 1 and collab["votes"][slot_id]["mine"] == -1
    (thread,) = collab["comments"].values()
    assert [(c["text"], c["mine"]) for c in thread] == [("Love this!", False)]

    # Only the author or the owner deletes a comment.
    assert client.post(f"/api/v1/plans/{pid}/join", json={"code": code}, headers=carol).status_code == 200
    assert client.delete(f"/api/v1/plans/{pid}/comments/{comment['id']}", headers=carol).status_code == 403
    assert client.delete(f"/api/v1/plans/{pid}/comments/{comment['id']}", headers=alice).status_code == 204

    # A new invite code disables the old link; members can leave; the owner can remove people.
    client.post(f"/api/v1/plans/{pid}/invite", headers=alice)
    assert client.post(f"/api/v1/plans/{pid}/join", json={"code": code}, headers=sign_in(client, "dave")).status_code == 403
    assert client.delete(f"/api/v1/plans/{pid}/members/{joined['members'][0]['id']}", headers=bob).status_code == 403
    carol_id = client.get("/api/v1/me", headers=carol).json()["id"]
    assert client.delete(f"/api/v1/plans/{pid}/members/{carol_id}", headers=carol).status_code == 204
    bob_id = client.get("/api/v1/me", headers=bob).json()["id"]
    assert client.delete(f"/api/v1/plans/{pid}/members/{bob_id}", headers=alice).status_code == 204
    assert [m["role"] for m in client.get(f"/api/v1/plans/{pid}/collab", headers=alice).json()["members"]] == ["owner"]


def test_signed_out_plans_stay_open(client):
    plan = client.post("/api/v1/plan", json=payload()).json()
    assert plan["owner_id"] is None
    assert client.get(f"/api/v1/plans/{plan['id']}/collab").json()["role"] == "open"
    # Anyone with the link can still change it, as before accounts existed.
    assert client.post(f"/api/v1/plans/{plan['id']}/days/2/replan", json={"reason": "museum closed"}).status_code == 200
    # Planning together needs an owner: a signed-in user makes their own copy first.
    alice = sign_in(client, "alice")
    assert client.post(f"/api/v1/plans/{plan['id']}/invite", headers=alice).status_code == 409
    copy = client.post(f"/api/v1/plans/{plan['id']}/copy", headers=alice).json()
    assert copy["id"] != plan["id"] and copy["root_id"] == copy["id"] and copy["version"] == 1
    assert client.post(f"/api/v1/plans/{copy['id']}/invite", headers=alice).status_code == 200


def test_saved_trips_follow_the_user(client):
    alice = sign_in(client, "alice")
    plan = client.post("/api/v1/plan", json=payload()).json()
    refined = client.post(f"/api/v1/plans/{plan['id']}/refine", json={"instruction": "slower mornings"}).json()
    assert client.put("/api/v1/me/saved", json={"plan_ids": [refined["id"], "0" * 32]}, headers=alice).json() == [plan["id"]]
    # Saved trips are kept: the 30-day expiry of signed-out plans no longer applies.
    stored = app.state.store._data["plans"]
    assert stored[plan["id"]][0] is None and stored[refined["id"]][0] is None
    # Saving any version brings the whole trip.
    trips = client.get("/api/v1/me/trips", headers=alice).json()
    assert {(t["id"], t["role"]) for t in trips} == {(plan["id"], "saved"), (refined["id"], "saved")}
    assert client.delete(f"/api/v1/me/saved/{plan['id']}", headers=alice).status_code == 204
    assert client.get("/api/v1/me/trips", headers=alice).json() == []


def test_checklist_is_personal(client):
    alice, bob = sign_in(client, "alice"), sign_in(client, "bob")
    plan = client.post("/api/v1/plan", json=payload()).json()
    url = f"/api/v1/plans/{plan['id']}/checklist"
    assert client.get(url).status_code == 401
    assert client.get(url, headers=alice).json()["checked"] == []
    body = {"checked": ["item:umbrella", "item:umbrella", "reminder:passport"], "custom": [{"id": "c1", "item": "Snacks", "category": "other"}]}
    saved = client.put(url, json=body, headers=alice).json()
    assert saved["checked"] == ["item:umbrella", "reminder:passport"] and saved["updated_at"]
    # Same list for every version of the trip, and nobody else's.
    refined = client.post(f"/api/v1/plans/{plan['id']}/refine", json={"instruction": "more museums"}).json()
    assert client.get(f"/api/v1/plans/{refined['id']}/checklist", headers=alice).json()["custom"][0]["item"] == "Snacks"
    assert client.get(url, headers=bob).json()["checked"] == []


def test_deleting_the_last_version_removes_trip_data(client):
    alice = sign_in(client, "alice")
    plan = client.post("/api/v1/plan", json=payload(), headers=alice).json()
    slot_id = plan["itinerary"]["days"][0]["slots"][0]["id"]
    client.post(f"/api/v1/plans/{plan['id']}/comments", json={"slot_id": slot_id, "text": "hi"}, headers=alice)
    assert app.state.store._data["comments"]
    assert client.delete(f"/api/v1/plans/{plan['id']}", headers=alice).status_code == 204
    assert not app.state.store._data["comments"]


def test_replan_route_validates_input(client):
    plan = client.post("/api/v1/plan", json=payload()).json()
    assert client.post(f"/api/v1/plans/{plan['id']}/days/2/replan", json={"reason": "x"}).status_code == 422
    assert client.post(f"/api/v1/plans/{plan['id']}/days/0/replan", json={"reason": "rainy"}).status_code == 422
    assert client.post(f"/api/v1/plans/{plan['id']}/days/7/replan", json={"reason": "rainy"}).status_code == 404
    app.state.generate.responses["ReplanDraft"] = ReplanDraft.model_validate({**rainy_day().model_dump(), "day": {**rainy_day().day.model_dump(), "slots": []}})
    assert client.post(f"/api/v1/plans/{plan['id']}/days/2/replan", json={"reason": "rainy"}).status_code == 502


def test_plans_saved_before_stop_ids_are_upgraded_once(client):
    plan = client.post("/api/v1/plan", json=payload()).json()
    refined = client.post(f"/api/v1/plans/{plan['id']}/refine", json={"instruction": "more food"}).json()
    store = app.state.store._data["plans"]
    for pid in (plan["id"], refined["id"]):
        stored = store[pid][1]
        stored.pop("root_id")
        for day in stored["itinerary"]["days"]:
            for slot in day["slots"]:
                slot.pop("id")
    first = client.get(f"/api/v1/plans/{refined['id']}").json()
    again = client.get(f"/api/v1/plans/{refined['id']}").json()
    assert first["root_id"] == plan["id"]
    ids = [s["id"] for d in first["itinerary"]["days"] for s in d["slots"]]
    assert all(ids) and ids == [s["id"] for d in again["itinerary"]["days"] for s in d["slots"]]


def test_eval_runs_are_listed_newest_first(client, tmp_path, monkeypatch):
    monkeypatch.setattr(evals_api, "RESULTS_DIR", tmp_path)
    for stamp, score in (("20260101T000000Z", 70), ("20260201T000000Z", 80)):
        run = {"meta": {"created_at": stamp}, "summary": {"mean_validator_score": score}, "records": [{"id": "tokyo"}]}
        (tmp_path / f"{stamp}.json").write_text(json.dumps(run))
    (tmp_path / "broken.json").write_text("{not json")

    runs = client.get("/api/v1/evals").json()
    assert [r["id"] for r in runs] == ["20260201T000000Z", "20260101T000000Z"]
    assert "records" not in runs[0] and runs[0]["summary"]["mean_validator_score"] == 80
    assert client.get("/api/v1/evals/20260101T000000Z").json()["records"] == [{"id": "tokyo"}]
    assert client.get("/api/v1/evals/..%2Fsecrets").status_code == 404
    assert client.get("/api/v1/evals/missing").status_code == 404
