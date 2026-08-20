"""Subscription middleware — enforces read-only and expired access states.

Uses a short-lived in-memory cache to avoid a DB query on every request.
Middleware order (in main.py):
  CORSMiddleware  →  SubscriptionMiddleware  →  RequestIDMiddleware  →  routes
"""

import re
import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from app.core.jwt import decode_token
from app.core.permissions import Role

logger = logging.getLogger("app.subscription_middleware")

# Paths that bypass subscription checks
_BYPASS_PATHS = re.compile(
    r"^(/api/v1/auth|/health|/uploads|/api/v1/subscriptions)",
)

# HTTP methods that are blocked in read-only mode
_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# In-memory cache: (subscriber_key) -> (status_str, expiry_timestamp)
_CACHE_TTL = 300  # 5 minutes
_CACHE_MAX_SIZE = 500  # Prevent unbounded growth
_status_cache: dict[str, tuple[str, float]] = {}


def _cache_key(subscriber_type: str, subscriber_id: str) -> str:
    return f"{subscriber_type}:{subscriber_id}"


def _evict_stale_entries():
    """Remove expired entries when cache is full."""
    now = time.monotonic()
    stale = [k for k, (_, exp) in _status_cache.items() if (now - exp) >= _CACHE_TTL]
    for k in stale:
        del _status_cache[k]


class SubscriptionMiddleware(BaseHTTPMiddleware):
    """Enforces subscription-based access control on non-super-admin users."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Fast exits — no DB, no JWT decode
        if not path.startswith("/api/"):
            return await call_next(request)

        if _BYPASS_PATHS.match(path):
            return await call_next(request)

        # Extract Bearer token
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return await call_next(request)

        token = auth_header.split(" ", 1)[1].strip()
        payload = decode_token(token)
        if not payload or payload.get("type") != "access":
            return await call_next(request)

        role = payload.get("role")

        # Super Admin always bypasses
        if role == Role.SUPER_ADMIN.value:
            return await call_next(request)

        # Resolve tenant from JWT claims
        admin_group_id = payload.get("admin_group_id")
        hospital_id = payload.get("hospital_id")

        # Build list of (subscriber_type, subscriber_id) pairs to check.
        # For HOSPITAL_ADMIN / DOCTOR we check hospital-level first, then
        # fall back to the parent group subscription (mirrors /me/status).
        lookup_candidates: list[tuple[str, str]] = []

        if role == Role.GROUP_ADMIN.value and admin_group_id:
            lookup_candidates = [("ADMIN_GROUP", admin_group_id)]
        elif role in (Role.HOSPITAL_ADMIN.value, Role.DOCTOR.value) and hospital_id:
            lookup_candidates = [("HOSPITAL", hospital_id)]
            if admin_group_id:
                lookup_candidates.append(("ADMIN_GROUP", admin_group_id))
        else:
            return await call_next(request)

        # Check cache / DB for the first candidate that has a subscription
        status_str = None
        cache_key_used = None

        for candidate_type, candidate_id in lookup_candidates:
            key = _cache_key(candidate_type, candidate_id)
            now_mono = time.monotonic()
            cached = _status_cache.get(key)

            if cached and (now_mono - cached[1]) < _CACHE_TTL:
                status_str = cached[0]
                cache_key_used = key
                # If the cached value is NO_SUBSCRIPTION and we have more
                # candidates, keep looking (the previous miss might have been
                # before the group subscription was created).
                if status_str != "NO_SUBSCRIPTION" or key == lookup_candidates[-1]:
                    break
                continue

            # Evict stale entries if cache is full
            if len(_status_cache) >= _CACHE_MAX_SIZE:
                _evict_stale_entries()

            # Resolve subscription from database (only when cache misses)
            try:
                from app.database import async_session_factory
                from app.services.subscription_access_service import resolve_tenant_subscription

                async with async_session_factory() as db:
                    info = await resolve_tenant_subscription(db, candidate_type, candidate_id)
                if info.has_subscription:
                    status_str = info.status or "ACTIVE"
                else:
                    status_str = "NO_SUBSCRIPTION"
            except Exception:
                logger.debug("Subscription check failed — allowing request")
                return await call_next(request)

            _status_cache[key] = (status_str, now_mono)
            cache_key_used = key

            if status_str != "NO_SUBSCRIPTION":
                break

        # Expired → block all
        if status_str == "EXPIRED":
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "Subscription Expired",
                    "message": "Your Appointin subscription has expired. Please contact your administrator to restore access.",
                    "contact": "superadmin@appointin.com",
                    "subscription_status": "EXPIRED",
                },
            )

        # Read-only → block writes (NO_SUBSCRIPTION, PAST_DUE, CANCELLED)
        if status_str in ("NO_SUBSCRIPTION", "PAST_DUE", "CANCELLED") and request.method in _WRITE_METHODS:
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "Account is read-only",
                    "message": "Your account is currently read-only. Contact the super admin for access.",
                    "contact": "superadmin@appointin.com",
                    "subscription_status": status_str,
                },
            )

        return await call_next(request)
