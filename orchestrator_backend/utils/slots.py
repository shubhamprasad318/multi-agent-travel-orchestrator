"""Stable stop ids across plan versions.

Votes and comments are attached to a stop's id, so when an agent rewrites an
itinerary, stops that survive (same activity) keep the id they had.
"""

from schemas import Itinerary, new_slot_id


def _key(activity: str) -> str:
    return " ".join(activity.lower().split())


def carry_over_slot_ids(previous: Itinerary | None, itinerary: Itinerary) -> Itinerary:
    """`itinerary` with each stop that also appears in `previous` given its previous id."""
    if previous is None:
        return itinerary
    pool: dict[str, list[str]] = {}
    for day in previous.days:
        for slot in day.slots:
            pool.setdefault(_key(slot.activity), []).append(slot.id)
    days = []
    for day in itinerary.days:
        slots = []
        for slot in day.slots:
            ids = pool.get(_key(slot.activity))
            slots.append(slot.model_copy(update={"id": ids.pop(0)}) if ids else slot)
        days.append(day.model_copy(update={"slots": slots}))
    return itinerary.model_copy(update={"days": days})


def unique_slot_ids(itinerary: Itinerary) -> Itinerary:
    """Give any stop whose id repeats an earlier one a fresh id (e.g. a duplicated stop)."""
    seen: set[str] = set()
    days = []
    for day in itinerary.days:
        slots = []
        for slot in day.slots:
            if slot.id in seen:
                slot = slot.model_copy(update={"id": new_slot_id()})
            seen.add(slot.id)
            slots.append(slot)
        days.append(day.model_copy(update={"slots": slots}))
    return itinerary.model_copy(update={"days": days})
