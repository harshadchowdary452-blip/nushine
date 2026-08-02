"""Request ID + security headers middleware."""

import re
import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from app.core.logging import correlation_id, generate_correlation_id

logger = logging.getLogger("app.middleware")

# Only accept a client-supplied correlation ID when it is a safe, bounded value.
_SAFE_CID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Adds correlation ID, timing, and hardened security headers to every response."""

    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get("X-Request-ID", "")
        # Always prefer a server-generated ID so the value cannot be spoofed or
        # used to poison logs; fall back to a sanitised client value when valid.
        cid = generate_correlation_id()
        if _SAFE_CID.match(incoming):
            cid = f"{cid[:8]}-{incoming}"
        correlation_id.set(cid)

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 1)

        response.headers["X-Request-ID"] = cid
        response.headers["X-Response-Time"] = f"{duration_ms}ms"

        # Security hardening headers (CSP intentionally omitted — the SPA relies
        # on inline styles; adding one here would break the application).
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.url.scheme == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

        # Log non-health-check requests
        path = request.url.path
        if not path.startswith("/health") and not path.startswith("/uploads"):
            extra = {
                "request_path": path,
                "request_method": request.method,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            }
            if response.status_code >= 500:
                logger.error(f"{request.method} {path} -> {response.status_code} ({duration_ms}ms)", extra=extra)
            elif response.status_code >= 400:
                logger.warning(f"{request.method} {path} -> {response.status_code} ({duration_ms}ms)", extra=extra)
            else:
                logger.info(f"{request.method} {path} -> {response.status_code} ({duration_ms}ms)", extra=extra)

        return response
