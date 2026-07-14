"""Request ID middleware for correlation tracking."""

import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from app.core.logging import correlation_id, generate_correlation_id

logger = logging.getLogger("app.middleware")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Adds correlation ID and timing to every request."""

    async def dispatch(self, request: Request, call_next):
        cid = request.headers.get("X-Request-ID", generate_correlation_id())
        correlation_id.set(cid)

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 1)

        response.headers["X-Request-ID"] = cid
        response.headers["X-Response-Time"] = f"{duration_ms}ms"

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
