"""Structured logging configuration with correlation IDs."""

import logging
import json
import sys
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Optional

# Context variable for request-scoped correlation ID
correlation_id: ContextVar[str] = ContextVar("correlation_id", default="")


class JSONFormatter(logging.Formatter):
    """JSON log formatter for production structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "correlation_id": correlation_id.get(""),
        }

        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)

        if hasattr(record, "request_path"):
            log_entry["path"] = record.request_path
        if hasattr(record, "request_method"):
            log_entry["method"] = record.request_method
        if hasattr(record, "status_code"):
            log_entry["status_code"] = record.status_code
        if hasattr(record, "duration_ms"):
            log_entry["duration_ms"] = record.duration_ms

        return json.dumps(log_entry, default=str)


class ReadableFormatter(logging.Formatter):
    """Human-readable formatter for development."""

    COLORS = {
        "DEBUG": "\033[36m",
        "INFO": "\033[32m",
        "WARNING": "\033[33m",
        "ERROR": "\033[31m",
        "CRITICAL": "\033[35m",
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, "")
        cid = correlation_id.get("")
        cid_str = f" [{cid[:8]}]" if cid else ""
        return f"{color}{record.levelname:<8}{self.RESET} {record.name}{cid_str}: {record.getMessage()}"


def generate_correlation_id() -> str:
    return str(uuid.uuid4())


def setup_logging(environment: str = "development") -> None:
    """Configure application logging based on environment."""
    root_logger = logging.getLogger("app")
    root_logger.setLevel(logging.DEBUG)

    # Clear existing handlers
    root_logger.handlers.clear()

    if environment == "production":
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONFormatter())
        handler.setLevel(logging.INFO)
    else:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(ReadableFormatter())
        handler.setLevel(logging.DEBUG)

    root_logger.addHandler(handler)

    # File handler for errors only
    error_handler = logging.FileHandler("server_errors.log", mode="a")
    error_handler.setFormatter(JSONFormatter() if environment == "production" else ReadableFormatter())
    error_handler.setLevel(logging.ERROR)
    root_logger.addHandler(error_handler)

    # Suppress noisy libraries
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
