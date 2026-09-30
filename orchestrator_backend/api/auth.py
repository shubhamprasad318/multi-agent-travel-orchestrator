"""Accounts: Google sign-in, the signed-in user's profile and their trips.

A user's trips are the plans they made while signed in, trips friends invited
them to, and trips they saved (e.g. from this browser's history before signing
in). Saving is only a bookmark: it never changes who owns a trip.
"""

from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from api.common import PLANS_COLLECTION, TRIPS_COLLECTION, client_key, get_store, require_user, root_of, valid_id
from utils.auth import USERS_COLLECTION, AuthError, user_id_for
from utils.store import Store

router = APIRouter(prefix="/api/v1")

MAX_SAVED = 200
MAX_LISTED_PLANS = 500


class GoogleSignIn(BaseModel):
    credential: str = Field(min_length=20, max_length=5000, description="Google ID token from Google Identity Services")


class User(BaseModel):
    id: str
    name: str
    email: str | None = None
    picture: str | None = None


class Session(BaseModel):
    token: str
    user: User


class SavedTrips(BaseModel):
    plan_ids: list[str] = Field(max_length=100)


class TripListItem(BaseModel):
    """A compact summary of one plan version for the "My trips" page."""

    id: str
    root_id: str
    parent_id: str | None
    version: int
    role: Literal["owner", "member", "saved"]
    destination: str
    stops: int
    start_date: str
    end_date: str
    days: int
    travelers: int
    created_at: str
    estimated_total_usd: float
    total_budget_usd: float
    budget_status: str
    score: int | None
    validation_status: str | None
    money: dict[str, Any] | None
    hotel: str | None
    activities: int
    refinements: int


def public_user(data: dict[str, Any]) -> User:
    return User(id=data["id"], name=data["name"], email=data.get("email"), picture=data.get("picture"))


@router.get("/auth/config")
async def auth_config(request: Request) -> dict[str, Any]:
    """What the frontend needs to show "Sign in with Google" (the client id is public)."""
    settings = request.app.state.settings
    return {"enabled": settings.auth_enabled, "google_client_id": settings.google_client_id}


@router.post("/auth/google", response_model=Session)
async def sign_in_with_google(body: GoogleSignIn, request: Request, store: Store = Depends(get_store)) -> Session:
    verify = request.app.state.verify_google
    if verify is None:
        raise HTTPException(503, "Sign-in is not configured on this server (GOOGLE_CLIENT_ID is not set).")
    if not request.app.state.chat_limiter.check(f"auth:{client_key(request)}"):
        raise HTTPException(429, "Too many sign-in attempts. Please wait a moment.")
    try:
        identity = await verify(body.credential)
    except AuthError as exc:
        raise HTTPException(401, str(exc)) from exc
    user_id = user_id_for(identity)
    now = datetime.now(timezone.utc).isoformat()
    existing = await store.get(USERS_COLLECTION, user_id) or {"created_at": now, "saved": []}
    user = {
        **existing,
        "id": user_id,
        "name": identity.name,
        "email": identity.email,
        "picture": identity.picture,
        "last_login": now,
    }
    await store.set(USERS_COLLECTION, user_id, user)
    return Session(token=request.app.state.signer.issue(user_id), user=public_user(user))


async def _user(store: Store, user_id: str) -> dict[str, Any]:
    user = await store.get(USERS_COLLECTION, user_id)
    if user is None:
        # A valid token for a user the store lost (e.g. in-memory store restarted).
        raise HTTPException(401, "Please sign in again.")
    return user


@router.get("/me", response_model=User)
async def me(user_id: str = Depends(require_user), store: Store = Depends(get_store)) -> User:
    return public_user(await _user(store, user_id))


def trip_item(plan: dict[str, Any], role: str) -> TripListItem:
    trip, budget, validation = plan["trip"], plan["budget"], plan.get("validation") or {}
    bookings = plan.get("bookings") or {}
    activities = (plan.get("activities") or {}).get("activities") or []
    return TripListItem(
        id=plan["id"],
        root_id=root_of(plan),
        parent_id=plan.get("parent_id"),
        version=plan.get("version", 1),
        role=role,
        destination=trip["destination"],
        stops=len(trip.get("stops") or []),
        start_date=trip["start_date"],
        end_date=trip["end_date"],
        days=trip["days"],
        travelers=trip["travelers"],
        created_at=plan["created_at"],
        estimated_total_usd=budget["estimated_total"],
        total_budget_usd=budget["total_budget"],
        budget_status=budget["status"],
        score=validation.get("overall_score"),
        validation_status=validation.get("status"),
        money=plan.get("money"),
        hotel=(bookings.get("hotels") or [{}])[0].get("name"),
        activities=len(activities),
        refinements=len(plan.get("refinements") or []),
    )


@router.get("/me/trips", response_model=list[TripListItem])
async def my_trips(user_id: str = Depends(require_user), store: Store = Depends(get_store)) -> list[TripListItem]:
    user = await _user(store, user_id)
    items: dict[str, TripListItem] = {}

    def add(plans: list[dict[str, Any]], role: str) -> None:
        for plan in plans:
            items.setdefault(plan["id"], trip_item(plan, role))

    add(await store.find(PLANS_COLLECTION, {"owner_id": user_id}, limit=MAX_LISTED_PLANS), "owner")
    member_roots = [t["root_id"] for t in await store.find(TRIPS_COLLECTION, {"member_ids": user_id})]
    if member_roots:
        add(await store.find(PLANS_COLLECTION, {"root_id": member_roots}, limit=MAX_LISTED_PLANS), "member")
    saved = [s for s in user.get("saved", []) if valid_id(s)]
    if saved:
        add(await store.find(PLANS_COLLECTION, {"root_id": saved}, limit=MAX_LISTED_PLANS), "saved")
        # Plans saved before trips had a root id are found by their own id.
        add(await store.find(PLANS_COLLECTION, {"id": saved}, limit=MAX_LISTED_PLANS), "saved")
    return sorted(items.values(), key=lambda t: t.created_at, reverse=True)


@router.put("/me/saved", response_model=list[str])
async def save_trips(body: SavedTrips, user_id: str = Depends(require_user), store: Store = Depends(get_store)) -> list[str]:
    """Bookmark trips (by any version's id) so they show up on every device.

    Plans made while signed out expire after 30 days; a saved trip's versions are kept.
    """
    user = await _user(store, user_id)
    saved: list[str] = list(user.get("saved", []))
    ids = [i for i in dict.fromkeys(body.plan_ids) if valid_id(i)]
    plans = await store.find(PLANS_COLLECTION, {"id": ids}, limit=len(ids)) if ids else []
    added: list[str] = []
    for plan in plans:
        root = root_of(plan)
        if plan.get("owner_id") != user_id and root not in saved:
            saved.append(root)
            added.append(root)
    if added:
        versions = await store.find(PLANS_COLLECTION, {"root_id": added}, limit=MAX_LISTED_PLANS)
        for plan in [*versions, *(p for p in plans if root_of(p) in added and not p.get("root_id"))]:
            await store.set(PLANS_COLLECTION, plan["id"], plan)  # no TTL: kept
    user["saved"] = saved[-MAX_SAVED:]
    await store.set(USERS_COLLECTION, user_id, user)
    return user["saved"]


@router.delete("/me/saved/{root_id}", status_code=204)
async def unsave_trip(root_id: str, user_id: str = Depends(require_user), store: Store = Depends(get_store)) -> None:
    user = await _user(store, user_id)
    user["saved"] = [s for s in user.get("saved", []) if s != root_id]
    await store.set(USERS_COLLECTION, user_id, user)
