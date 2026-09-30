"""Accounts: Google sign-in and signed session tokens.

The browser gets a Google ID token from Google Identity Services and sends it
once to `POST /api/v1/auth/google`. We verify it with Google's public keys and
answer with our own session token (HMAC-signed, no server-side session state),
which the browser then sends as `Authorization: Bearer <token>`.
"""

import asyncio
import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from utils.logger import get_logger

logger = get_logger(__name__)

USERS_COLLECTION = "users"


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str | None
    name: str
    picture: str | None


# Verifies a Google ID token and returns who it belongs to; raises ValueError if invalid.
GoogleVerifier = Callable[[str], Awaitable[GoogleIdentity]]


class AuthError(ValueError):
    """A sign-in or session problem. The message is safe to show users."""


def google_verifier(client_id: str) -> GoogleVerifier:
    """Production verifier: checks signature, expiry, issuer and audience."""
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    transport = google_requests.Request()

    async def verify(token: str) -> GoogleIdentity:
        try:
            # The library is synchronous (it may fetch Google's signing keys).
            info = await asyncio.to_thread(id_token.verify_oauth2_token, token, transport, client_id)
        except Exception as exc:  # noqa: BLE001 - every failure means "not signed in"
            logger.info("Google ID token rejected: %s", exc)
            raise AuthError("Google sign-in failed. Please try again.") from exc
        return identity_from_claims(info)

    return verify


def identity_from_claims(info: dict[str, Any]) -> GoogleIdentity:
    if not info.get("sub"):
        raise AuthError("Google sign-in failed. Please try again.")
    email = info.get("email") if info.get("email_verified") else None
    name = str(info.get("name") or info.get("given_name") or (email or "Traveller").split("@")[0])[:80]
    picture = info.get("picture")
    return GoogleIdentity(
        sub=str(info["sub"]),
        email=email,
        name=name,
        picture=picture if isinstance(picture, str) and picture.startswith("https://") else None,
    )


def user_id_for(identity: GoogleIdentity) -> str:
    """Our user id: stable per Google account, without exposing Google's id to other users."""
    return hashlib.sha256(f"google:{identity.sub}".encode()).hexdigest()[:24]


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


class SessionSigner:
    def __init__(self, secret: str | None, days: int) -> None:
        if not secret:
            # Fine for local development; every restart signs everyone out.
            secret = secrets.token_urlsafe(48)
        self._key = secret.encode()
        self.ttl_seconds = days * 24 * 3600

    def _sign(self, payload: str) -> str:
        return _b64(hmac.new(self._key, payload.encode(), hashlib.sha256).digest())

    def issue(self, user_id: str, now: float | None = None) -> str:
        payload = _b64(json.dumps({"sub": user_id, "exp": int((now or time.time()) + self.ttl_seconds)}).encode())
        return f"{payload}.{self._sign(payload)}"

    def verify(self, token: str, now: float | None = None) -> str:
        """Returns the user id, or raises AuthError."""
        payload, _, signature = token.partition(".")
        if not payload or not hmac.compare_digest(signature, self._sign(payload)):
            raise AuthError("Your session is invalid. Please sign in again.")
        try:
            claims = json.loads(_unb64(payload))
        except ValueError as exc:
            raise AuthError("Your session is invalid. Please sign in again.") from exc
        if not isinstance(claims, dict) or not isinstance(claims.get("sub"), str):
            raise AuthError("Your session is invalid. Please sign in again.")
        if claims.get("exp", 0) < (now or time.time()):
            raise AuthError("Your session expired. Please sign in again.")
        return claims["sub"]
