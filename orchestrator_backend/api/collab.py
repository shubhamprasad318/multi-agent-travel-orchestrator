"""Planning a trip together, plus each traveller's own packing checklist.

A trip made while signed in belongs to its owner, who can share an invite link.
Friends who sign in and open it become members: they can vote on stops, comment
on them and change the plan. Everything here is keyed by the trip's root plan
id, so it carries over to every version of the trip.
"""

import hmac
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from pydantic import BaseModel, Field, field_validator

from api.common import (
    TRIPS_COLLECTION,
    Role,
    client_key,
    load_plan_data,
    optional_user,
    require_user,
    role_in,
    root_of,
)
from schemas import PackingCategory
from utils.auth import USERS_COLLECTION
from utils.store import Store

router = APIRouter(prefix="/api/v1/plans/{plan_id}")

VOTES_COLLECTION = "votes"
COMMENTS_COLLECTION = "comments"
CHECKLISTS_COLLECTION = "checklists"
MAX_MEMBERS = 20
MAX_COMMENTS_PER_TRIP = 1000
MAX_CUSTOM_ITEMS = 60

SlotId = Path(pattern=r"^[A-Za-z0-9_-]{1,40}$")


class Person(BaseModel):
    id: str
    name: str
    picture: str | None = None


class Member(Person):
    role: Role
    joined_at: str | None = None


class VoteTally(BaseModel):
    up: int = 0
    down: int = 0
    # This user's vote: 1, -1 or 0.
    mine: int = 0
    # Names of who voted up / down, for tooltips.
    up_names: list[str] = Field(default_factory=list)
    down_names: list[str] = Field(default_factory=list)


class Comment(BaseModel):
    id: str
    slot_id: str
    author: Person
    text: str
    created_at: str
    mine: bool = False


class Collab(BaseModel):
    """Everything the itinerary needs to show sharing, votes and comments."""

    # "open": made while signed out, anyone with the link can change it.
    # "viewer": signed out, or not invited; can only look.
    role: Literal["owner", "member", "viewer", "open"]
    can_edit: bool
    owner: Person | None = None
    members: list[Member] = Field(default_factory=list)
    # Only shown to the owner; None when there's no active invite link.
    invite_code: str | None = None
    votes: dict[str, VoteTally] = Field(default_factory=dict)
    comments: dict[str, list[Comment]] = Field(default_factory=dict)


class JoinRequest(BaseModel):
    code: str = Field(min_length=6, max_length=64)


class VoteRequest(BaseModel):
    value: Literal[-1, 0, 1]


class CommentRequest(BaseModel):
    slot_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,40}$")
    text: str = Field(min_length=1, max_length=1000)

    @field_validator("text")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("comment is empty")
        return value


class CustomItem(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,40}$")
    item: str = Field(min_length=1, max_length=80)
    category: PackingCategory = "other"


class Checklist(BaseModel):
    # Keys of checked items: packing items by name ("item:umbrella"), reminders by id.
    checked: list[str] = Field(default_factory=list, max_length=400)
    custom: list[CustomItem] = Field(default_factory=list, max_length=MAX_CUSTOM_ITEMS)
    updated_at: str | None = None

    @field_validator("checked")
    @classmethod
    def _bounded(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(v[:120] for v in value if v))


async def _limit(request: Request, user_id: str) -> None:
    if not request.app.state.collab_limiter.check(f"collab:{user_id}:{client_key(request)}"):
        raise HTTPException(429, "Slow down a little and try again in a moment.")


def _slot_ids(plan: dict[str, Any]) -> set[str]:
    days = (plan.get("itinerary") or {}).get("days") or []
    return {slot["id"] for day in days for slot in day.get("slots", []) if "id" in slot}


async def _people(store: Store, user_ids: set[str]) -> dict[str, Person]:
    found = await store.find(USERS_COLLECTION, {"id": list(user_ids)}, limit=len(user_ids)) if user_ids else []
    people = {u["id"]: Person(id=u["id"], name=u.get("name") or "Traveller", picture=u.get("picture")) for u in found}
    return {uid: people.get(uid, Person(id=uid, name="Former traveller")) for uid in user_ids}


async def _trip(store: Store, plan: dict[str, Any]) -> dict[str, Any]:
    root = root_of(plan)
    return await store.get(TRIPS_COLLECTION, root) or {
        "root_id": root,
        "owner_id": plan.get("owner_id"),
        "invite_code": None,
        "member_ids": [],
        "joined": {},
    }


async def _participant(request: Request, plan_id: str, user_id: str) -> tuple[dict[str, Any], Role]:
    store: Store = request.app.state.store
    plan = await load_plan_data(store, plan_id)
    role = await role_in(store, plan, user_id)
    if role is None:
        if plan.get("owner_id") is None:
            raise HTTPException(409, "Save this trip to your account first to plan it with friends.")
        raise HTTPException(403, "Only the trip's owner and the friends they invited can do that.")
    return plan, role


@router.get("/collab", response_model=Collab)
async def get_collab(plan_id: str, request: Request, user_id: str | None = Depends(optional_user)) -> Collab:
    store: Store = request.app.state.store
    plan = await load_plan_data(store, plan_id)
    owner_id = plan.get("owner_id")
    if owner_id is None:
        return Collab(role="open", can_edit=True)
    role = await role_in(store, plan, user_id)
    owner = (await _people(store, {owner_id}))[owner_id]
    if role is None:
        # Viewers see whose trip it is, but not the group's names, votes or comments.
        return Collab(role="viewer", can_edit=False, owner=owner)

    root = root_of(plan)
    trip = await _trip(store, plan)
    votes = await store.find(VOTES_COLLECTION, {"root_id": root}, limit=5000)
    comments = sorted(await store.find(COMMENTS_COLLECTION, {"root_id": root}, limit=MAX_COMMENTS_PER_TRIP), key=lambda c: c["created_at"])
    people = await _people(store, {owner_id, *trip["member_ids"], *(v["user_id"] for v in votes), *(c["user_id"] for c in comments)})

    tallies: dict[str, VoteTally] = {}
    for vote in votes:
        tally = tallies.setdefault(vote["slot_id"], VoteTally())
        name = people[vote["user_id"]].name
        if vote["value"] > 0:
            tally.up += 1
            tally.up_names.append(name)
        else:
            tally.down += 1
            tally.down_names.append(name)
        if vote["user_id"] == user_id:
            tally.mine = vote["value"]
    threads: dict[str, list[Comment]] = {}
    for c in comments:
        threads.setdefault(c["slot_id"], []).append(
            Comment(id=c["id"], slot_id=c["slot_id"], author=people[c["user_id"]], text=c["text"], created_at=c["created_at"], mine=c["user_id"] == user_id)
        )
    members = [Member(**owner.model_dump(), role="owner")] + [
        Member(**people[m].model_dump(), role="member", joined_at=trip.get("joined", {}).get(m)) for m in trip["member_ids"]
    ]
    return Collab(
        role=role,
        can_edit=True,
        owner=owner,
        members=members,
        invite_code=trip.get("invite_code") if role == "owner" else None,
        votes=tallies,
        comments=threads,
    )


@router.post("/invite")
async def create_invite(plan_id: str, request: Request, user_id: str = Depends(require_user)) -> dict[str, str]:
    """Create (or replace) the invite link's code. Replacing it disables the old link."""
    plan, role = await _participant(request, plan_id, user_id)
    if role != "owner":
        raise HTTPException(403, "Only the trip's owner can invite people.")
    trip = await _trip(request.app.state.store, plan)
    trip["invite_code"] = secrets.token_urlsafe(9)
    await request.app.state.store.set(TRIPS_COLLECTION, trip["root_id"], trip)
    return {"invite_code": trip["invite_code"]}


@router.delete("/invite", status_code=204)
async def disable_invite(plan_id: str, request: Request, user_id: str = Depends(require_user)) -> None:
    plan, role = await _participant(request, plan_id, user_id)
    if role != "owner":
        raise HTTPException(403, "Only the trip's owner can change the invite link.")
    trip = await _trip(request.app.state.store, plan)
    trip["invite_code"] = None
    await request.app.state.store.set(TRIPS_COLLECTION, trip["root_id"], trip)


@router.post("/join", response_model=Collab)
async def join_trip(plan_id: str, body: JoinRequest, request: Request, user_id: str = Depends(require_user)) -> Collab:
    store: Store = request.app.state.store
    await _limit(request, user_id)
    plan = await load_plan_data(store, plan_id)
    if plan.get("owner_id") is None:
        raise HTTPException(409, "This trip isn't shared for planning together.")
    if await role_in(store, plan, user_id) is None:
        trip = await _trip(store, plan)
        code = trip.get("invite_code")
        if not code or not hmac.compare_digest(code, body.code):
            raise HTTPException(403, "This invite link is no longer valid. Ask for a new one.")
        if len(trip["member_ids"]) >= MAX_MEMBERS:
            raise HTTPException(409, f"This trip already has {MAX_MEMBERS} members.")
        trip["member_ids"].append(user_id)
        trip.setdefault("joined", {})[user_id] = datetime.now(timezone.utc).isoformat()
        await store.set(TRIPS_COLLECTION, trip["root_id"], trip)
    return await get_collab(plan_id, request, user_id)


@router.delete("/members/{member_id}", status_code=204)
async def remove_member(plan_id: str, member_id: str, request: Request, user_id: str = Depends(require_user)) -> None:
    """The owner removes someone, or a member leaves."""
    plan, role = await _participant(request, plan_id, user_id)
    if role != "owner" and member_id != user_id:
        raise HTTPException(403, "Only the trip's owner can remove people.")
    trip = await _trip(request.app.state.store, plan)
    trip["member_ids"] = [m for m in trip["member_ids"] if m != member_id]
    trip.get("joined", {}).pop(member_id, None)
    await request.app.state.store.set(TRIPS_COLLECTION, trip["root_id"], trip)


@router.put("/votes/{slot_id}", response_model=VoteTally)
async def vote(
    plan_id: str, body: VoteRequest, request: Request, slot_id: str = SlotId, user_id: str = Depends(require_user)
) -> VoteTally:
    store: Store = request.app.state.store
    await _limit(request, user_id)
    plan, _ = await _participant(request, plan_id, user_id)
    if slot_id not in _slot_ids(plan):
        raise HTTPException(404, "That stop isn't in this version of the trip.")
    root = root_of(plan)
    key = f"{root}:{slot_id}:{user_id}"
    if body.value == 0:
        await store.delete(VOTES_COLLECTION, key)
    else:
        await store.set(VOTES_COLLECTION, key, {"root_id": root, "slot_id": slot_id, "user_id": user_id, "value": body.value})
    votes = await store.find(VOTES_COLLECTION, {"root_id": root, "slot_id": slot_id}, limit=500)
    people = await _people(store, {v["user_id"] for v in votes})
    return VoteTally(
        up=sum(v["value"] > 0 for v in votes),
        down=sum(v["value"] < 0 for v in votes),
        mine=body.value,
        up_names=[people[v["user_id"]].name for v in votes if v["value"] > 0],
        down_names=[people[v["user_id"]].name for v in votes if v["value"] < 0],
    )


@router.post("/comments", response_model=Comment, status_code=201)
async def add_comment(plan_id: str, body: CommentRequest, request: Request, user_id: str = Depends(require_user)) -> Comment:
    store: Store = request.app.state.store
    await _limit(request, user_id)
    plan, _ = await _participant(request, plan_id, user_id)
    if body.slot_id not in _slot_ids(plan):
        raise HTTPException(404, "That stop isn't in this version of the trip.")
    root = root_of(plan)
    if len(await store.find(COMMENTS_COLLECTION, {"root_id": root}, limit=MAX_COMMENTS_PER_TRIP)) >= MAX_COMMENTS_PER_TRIP:
        raise HTTPException(409, "This trip has reached its comment limit.")
    comment = {
        "id": uuid.uuid4().hex,
        "root_id": root,
        "slot_id": body.slot_id,
        "user_id": user_id,
        "text": body.text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await store.set(COMMENTS_COLLECTION, comment["id"], comment)
    author = (await _people(store, {user_id}))[user_id]
    return Comment(id=comment["id"], slot_id=body.slot_id, author=author, text=body.text, created_at=comment["created_at"], mine=True)


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(plan_id: str, comment_id: str, request: Request, user_id: str = Depends(require_user)) -> None:
    store: Store = request.app.state.store
    plan, role = await _participant(request, plan_id, user_id)
    comment = await store.get(COMMENTS_COLLECTION, comment_id) if comment_id.isalnum() else None
    if comment is None or comment["root_id"] != root_of(plan):
        raise HTTPException(404, "Comment not found.")
    if comment["user_id"] != user_id and role != "owner":
        raise HTTPException(403, "You can only delete your own comments.")
    await store.delete(COMMENTS_COLLECTION, comment_id)


@router.get("/checklist", response_model=Checklist)
async def get_checklist(plan_id: str, request: Request, user_id: str = Depends(require_user)) -> Checklist:
    """This traveller's own packing and to-do checklist for the trip (any version)."""
    store: Store = request.app.state.store
    plan = await load_plan_data(store, plan_id)
    saved = await store.get(CHECKLISTS_COLLECTION, f"{root_of(plan)}:{user_id}")
    return Checklist.model_validate(saved) if saved else Checklist()


@router.put("/checklist", response_model=Checklist)
async def save_checklist(plan_id: str, body: Checklist, request: Request, user_id: str = Depends(require_user)) -> Checklist:
    store: Store = request.app.state.store
    await _limit(request, user_id)
    plan = await load_plan_data(store, plan_id)
    root = root_of(plan)
    checklist = body.model_copy(update={"updated_at": datetime.now(timezone.utc).isoformat()})
    await store.set(CHECKLISTS_COLLECTION, f"{root}:{user_id}", {**checklist.model_dump(), "root_id": root, "user_id": user_id})
    return checklist


async def delete_trip_data(store: Store, root: str) -> None:
    """Remove a deleted trip's votes, comments and checklists."""
    for collection in (VOTES_COLLECTION, COMMENTS_COLLECTION, CHECKLISTS_COLLECTION):
        for item in await store.find(collection, {"root_id": root}, limit=5000):
            key = item["id"] if collection == COMMENTS_COLLECTION else (
                f"{root}:{item['slot_id']}:{item['user_id']}" if collection == VOTES_COLLECTION else f"{root}:{item['user_id']}"
            )
            await store.delete(collection, key)
