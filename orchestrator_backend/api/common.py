"""Helpers shared by the API routers: storage of plans, identity and access rules.

Access rules:
- Anyone with a plan's link can view it (share links).
- A plan made while signed out has no owner: anyone with the link can change it.
- A plan made while signed in belongs to its owner: only the owner and friends
  who joined through the owner's invite link can change it, vote or comment.
"""

import time
from collections import defaultdict, deque
from typing import Any, Literal

from fastapi import HTTPException, Request

from agents.base import AgentContext
from schemas import TravelPlan
from utils.auth import AuthError
from utils.store import Store

PLANS_COLLECTION = "plans"
# Trip-level data, all keyed by the trip's root plan id.
TRIPS_COLLECTION = "trips"
# Plans made while signed out expire; signed-in users' trips are kept.
PLAN_TTL_SECONDS = 30 * 24 * 3600

Role = Literal["owner", "member"]


class RateLimiter:
    """Sliding-window limit per client key. In-memory: one limiter per process."""

    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> bool:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > 60:
            hits.popleft()
        if len(hits) >= self.per_minute:
            return False
        hits.append(now)
        return True


def get_store(request: Request) -> Store:
    return request.app.state.store


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def context(request: Request, emit=None) -> AgentContext:
    ctx = AgentContext(
        settings=request.app.state.settings,
        store=request.app.state.store,
        generate=request.app.state.generate,
        # Tests swap in fixed exchange rates and fares; production uses utils.fx / utils.fares.
        fx=getattr(request.app.state, "fx", None),
        fares=getattr(request.app.state, "fares", None),
    )
    if emit is not None:
        ctx.emit = emit
    return ctx


def root_of(plan: dict[str, Any] | TravelPlan) -> str:
    """The id shared by every version of a trip."""
    if isinstance(plan, TravelPlan):
        return plan.root_id or plan.id
    return plan.get("root_id") or plan["id"]


def valid_id(value: str, length: int = 32) -> bool:
    return value.isalnum() and len(value) == length


async def save_plan(store: Store, plan: TravelPlan, keep: bool = False) -> dict[str, Any]:
    data = plan.model_dump(mode="json")
    persistent = keep or plan.owner_id is not None
    await store.set(PLANS_COLLECTION, plan.id, data, ttl=None if persistent else PLAN_TTL_SECONDS)
    return data


async def load_plan_data(store: Store, plan_id: str) -> dict[str, Any]:
    data = await store.get(PLANS_COLLECTION, plan_id) if valid_id(plan_id) else None
    if data is None:
        raise HTTPException(404, "Plan not found or expired")
    if _needs_upgrade(data):
        # Plans saved before stops had ids and trips had a root: fill both in
        # once, so votes and comments attach to the same stop on every load.
        plan = TravelPlan.model_validate(data, context={"stored": True})
        root = plan.root_id or await _legacy_root(store, data)
        data = await save_plan(store, plan.model_copy(update={"root_id": root}))
    return data


def _needs_upgrade(data: dict[str, Any]) -> bool:
    if not data.get("root_id"):
        return True
    days = (data.get("itinerary") or {}).get("days") or []
    return any("id" not in slot for day in days for slot in day.get("slots", []))


async def _legacy_root(store: Store, data: dict[str, Any]) -> str:
    """The first version's id, following parent links (bounded, and cycle-safe)."""
    current, seen = data, {data["id"]}
    while current.get("parent_id") and len(seen) < 50:
        if current.get("root_id"):
            return current["root_id"]
        parent = await store.get(PLANS_COLLECTION, current["parent_id"])
        if parent is None or parent["id"] in seen:
            return current["parent_id"]
        seen.add(parent["id"])
        current = parent
    return current.get("root_id") or current["id"]


async def load_plan(store: Store, plan_id: str) -> TravelPlan:
    # Stored plans may have dates in the past; that's fine for a saved plan.
    return TravelPlan.model_validate(await load_plan_data(store, plan_id), context={"stored": True})


def optional_user(request: Request) -> str | None:
    """The signed-in user's id, None if signed out. A bad or expired token is a 401."""
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    try:
        return request.app.state.signer.verify(token.strip())
    except AuthError as exc:
        raise HTTPException(401, str(exc)) from exc


def require_user(request: Request) -> str:
    user_id = optional_user(request)
    if user_id is None:
        raise HTTPException(401, "Please sign in first.")
    return user_id


async def role_in(store: Store, plan: dict[str, Any] | TravelPlan, user_id: str | None) -> Role | None:
    owner = plan.owner_id if isinstance(plan, TravelPlan) else plan.get("owner_id")
    if owner is None or user_id is None:
        return None
    if user_id == owner:
        return "owner"
    trip = await store.get(TRIPS_COLLECTION, root_of(plan))
    return "member" if trip and user_id in trip.get("member_ids", []) else None


async def can_edit(store: Store, plan: dict[str, Any] | TravelPlan, user_id: str | None) -> bool:
    owner = plan.owner_id if isinstance(plan, TravelPlan) else plan.get("owner_id")
    return owner is None or await role_in(store, plan, user_id) is not None


async def require_edit(store: Store, plan: dict[str, Any] | TravelPlan, user_id: str | None) -> None:
    if not await can_edit(store, plan, user_id):
        if user_id is None:
            raise HTTPException(401, "Sign in to change this trip.")
        raise HTTPException(403, "Only the trip's owner and the friends they invited can change it.")
