"""Key/value persistence used for the tool cache, saved plans, users and trip sharing.

`MemoryStore` is the zero-config default (data is lost on restart).
`MongoStore` is used when `MONGODB_URI` is set.

`find` matches top-level fields of stored values by equality; when the stored
field is a list, it matches if the list contains the value (as MongoDB does).
A list as the wanted value means "any of these".
"""

import time
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

from utils.logger import get_logger

logger = get_logger(__name__)


class Store(Protocol):
    async def get(self, collection: str, key: str) -> dict[str, Any] | None: ...

    async def set(self, collection: str, key: str, value: dict[str, Any], ttl: int | None = None) -> None: ...

    async def delete(self, collection: str, key: str) -> None: ...

    async def find(self, collection: str, where: dict[str, Any], limit: int = 200) -> list[dict[str, Any]]: ...

    async def close(self) -> None: ...


def _matches(value: dict[str, Any], where: dict[str, Any]) -> bool:
    for field, wanted in where.items():
        actual = value.get(field)
        options = wanted if isinstance(wanted, list) else [wanted]
        present = actual if isinstance(actual, list) else [actual]
        if not any(item in options for item in present):
            return False
    return True


class MemoryStore:
    def __init__(self, max_items_per_collection: int = 500) -> None:
        self._max = max_items_per_collection
        self._data: dict[str, OrderedDict[str, tuple[float | None, dict[str, Any]]]] = {}

    async def get(self, collection: str, key: str) -> dict[str, Any] | None:
        bucket = self._data.get(collection)
        if not bucket or key not in bucket:
            return None
        expires_at, value = bucket[key]
        if expires_at is not None and expires_at < time.time():
            del bucket[key]
            return None
        bucket.move_to_end(key)
        return value

    async def set(self, collection: str, key: str, value: dict[str, Any], ttl: int | None = None) -> None:
        bucket = self._data.setdefault(collection, OrderedDict())
        bucket[key] = (time.time() + ttl if ttl else None, value)
        bucket.move_to_end(key)
        while len(bucket) > self._max:
            bucket.popitem(last=False)

    async def delete(self, collection: str, key: str) -> None:
        self._data.get(collection, OrderedDict()).pop(key, None)

    async def find(self, collection: str, where: dict[str, Any], limit: int = 200) -> list[dict[str, Any]]:
        now = time.time()
        found = []
        for expires_at, value in list(self._data.get(collection, OrderedDict()).values()):
            if (expires_at is None or expires_at >= now) and _matches(value, where):
                found.append(value)
                if len(found) >= limit:
                    break
        return found

    async def close(self) -> None:
        self._data.clear()


class MongoStore:
    def __init__(self, uri: str, database: str) -> None:
        from pymongo import AsyncMongoClient

        self._client = AsyncMongoClient(uri, serverSelectionTimeoutMS=3000, tz_aware=True)
        self._db = self._client[database]
        self._indexed: set[str] = set()
        self._field_indexes: set[tuple[str, str]] = set()

    async def _collection(self, name: str):
        collection = self._db[name]
        if name not in self._indexed:
            # Documents without `expires_at` never expire.
            await collection.create_index("expires_at", expireAfterSeconds=0)
            self._indexed.add(name)
        return collection

    async def get(self, collection: str, key: str) -> dict[str, Any] | None:
        doc = await (await self._collection(collection)).find_one({"_id": key})
        if not doc:
            return None
        # The TTL monitor runs about once a minute, so double-check expiry.
        expires_at = doc.get("expires_at")
        if expires_at is not None and expires_at < datetime.now(timezone.utc):
            return None
        return doc["value"]

    async def set(self, collection: str, key: str, value: dict[str, Any], ttl: int | None = None) -> None:
        doc: dict[str, Any] = {"_id": key, "value": value}
        if ttl:
            doc["expires_at"] = datetime.now(timezone.utc) + timedelta(seconds=ttl)
        await (await self._collection(collection)).replace_one({"_id": key}, doc, upsert=True)

    async def delete(self, collection: str, key: str) -> None:
        await (await self._collection(collection)).delete_one({"_id": key})

    async def find(self, collection: str, where: dict[str, Any], limit: int = 200) -> list[dict[str, Any]]:
        coll = await self._collection(collection)
        for field in where:
            if (collection, field) not in self._field_indexes:
                await coll.create_index(f"value.{field}")
                self._field_indexes.add((collection, field))
        query: dict[str, Any] = {
            f"value.{field}": {"$in": wanted} if isinstance(wanted, list) else wanted for field, wanted in where.items()
        }
        now = datetime.now(timezone.utc)
        query["$or"] = [{"expires_at": {"$exists": False}}, {"expires_at": {"$gte": now}}]
        return [doc["value"] async for doc in coll.find(query).limit(limit)]

    async def close(self) -> None:
        await self._client.close()


async def create_store(mongodb_uri: str | None, database: str) -> Store:
    if not mongodb_uri:
        logger.info("MONGODB_URI not set; using in-memory store (plans are lost on restart)")
        return MemoryStore()
    try:
        store = MongoStore(mongodb_uri, database)
        await store._client.admin.command("ping")
        logger.info("Connected to MongoDB database %r", database)
        return store
    except Exception as exc:  # noqa: BLE001 - any connection failure means fall back
        logger.warning("MongoDB unavailable (%s); falling back to in-memory store", exc)
        return MemoryStore()
