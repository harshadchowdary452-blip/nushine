"""
Production server launcher for Appointin.

Usage:
    python -m scripts.run_prod

Features:
- Configurable workers (default: CPU count, min 2)
- Graceful shutdown with connection draining
- Backlog tuning for high concurrency
- Logging configured for production
"""

import os
import sys
import logging

LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()


def main():
    try:
        import uvicorn
    except ImportError:
        print("uvicorn not installed. Run: pip install uvicorn[standard]")
        sys.exit(1)

    workers = int(os.getenv("WEB_CONCURRENCY", max(2, os.cpu_count() or 2)))
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    logging.basicConfig(level=LOG_LEVEL, format=LOG_FORMAT)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    config = uvicorn.Config(
        "app.main:app",
        host=host,
        port=port,
        workers=workers,
        loop="auto",
        http="httptools",
        ws="websockets",
        backlog=4096,
        timeout_keep_alive=30,
        timeout_notify=30,
        graceful_shutdown_timeout=30,
        access_log=False,
        log_level=LOG_LEVEL.lower(),
    )
    server = uvicorn.Server(config)
    server.run()


if __name__ == "__main__":
    main()
