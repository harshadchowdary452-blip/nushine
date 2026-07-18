"""CRM Event System — standardized event model, publisher, and dispatcher."""
from __future__ import annotations
import uuid
import logging
import time as _time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional, Any, Callable, Awaitable
from sqlalchemy.ext.asyncio import AsyncSession

from app.crm.enums import EventType, EventStatus, EventSource

logger = logging.getLogger("crm.events")


# ============================================================
# Event Payload
# ============================================================

@dataclass
class EventPayload:
    """Standard event payload — every event uses this single model."""
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str = ""
    source_module: str = ""
    entity_type: str = ""
    entity_id: str = ""
    hospital_id: Optional[str] = None
    group_id: Optional[str] = None
    patient_id: Optional[str] = None
    doctor_id: Optional[str] = None
    triggered_by: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    correlation_id: Optional[str] = None
    payload: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> EventPayload:
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


# ============================================================
# Event Publisher
# ============================================================

class EventPublisher:
    """Publishes events to the Event Dispatcher. No module should know CRM internals."""

    def __init__(self, dispatcher: Optional[EventDispatcher] = None):
        self._dispatcher = dispatcher

    def set_dispatcher(self, dispatcher: EventDispatcher) -> None:
        self._dispatcher = dispatcher

    async def publish(
        self,
        event_type: EventType | str,
        source_module: EventSource | str,
        entity_type: str,
        entity_id: str,
        hospital_id: Optional[str] = None,
        group_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        doctor_id: Optional[str] = None,
        triggered_by: Optional[str] = None,
        correlation_id: Optional[str] = None,
        payload: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
        db: Optional[AsyncSession] = None,
    ) -> EventPayload:
        """Create and dispatch an event. Returns the event payload."""
        event = EventPayload(
            event_type=str(event_type),
            source_module=str(source_module),
            entity_type=entity_type,
            entity_id=entity_id,
            hospital_id=hospital_id,
            group_id=group_id,
            patient_id=patient_id,
            doctor_id=doctor_id,
            triggered_by=triggered_by,
            correlation_id=correlation_id or str(uuid.uuid4()),
            payload=payload or {},
            metadata=metadata or {},
        )

        logger.info(
            "EVENT_PUBLISHED: type=%s entity=%s/%s hospital=%s correlation=%s",
            event.event_type, event.entity_type, event.entity_id,
            event.hospital_id, event.correlation_id,
        )

        if self._dispatcher:
            try:
                await self._dispatcher.dispatch(event, db=db)
            except Exception as exc:
                logger.error(
                    "EVENT_DISPATCH_FAILED: event=%s error=%s — business operation NOT rolled back",
                    event.event_id, str(exc),
                    exc_info=True,
                )

        return event


# ============================================================
# Event Handler Type
# ============================================================

EventHandler = Callable[[EventPayload, Optional[AsyncSession]], Awaitable[None]]


# ============================================================
# Event Dispatcher
# ============================================================

class EventDispatcher:
    """Receives events, identifies subscribers, forwards to handlers.
    
    Supports multiple listeners per event type. Future subscribers:
    - Notification Engine
    - Analytics Engine
    - Audit Engine
    - AI Engine
    - External APIs
    """

    def __init__(self):
        self._handlers: dict[str, list[EventHandler]] = {}
        self._global_handlers: list[EventHandler] = []

    def subscribe(self, event_type: EventType | str, handler: EventHandler) -> None:
        """Register a handler for a specific event type."""
        key = str(event_type)
        if key not in self._handlers:
            self._handlers[key] = []
        self._handlers[key].append(handler)
        logger.debug("DISPATCHER: subscribed %s to %s", handler.__name__, key)

    def subscribe_all(self, handler: EventHandler) -> None:
        """Register a handler for ALL event types."""
        self._global_handlers.append(handler)
        logger.debug("DISPATCHER: subscribed %s to ALL events", handler.__name__)

    async def dispatch(self, event: EventPayload, db: Optional[AsyncSession] = None) -> None:
        """Dispatch an event to all matching handlers."""
        handlers = self._handlers.get(event.event_type, []) + self._global_handlers
        if not handlers:
            logger.debug("DISPATCHER: no handlers for event type %s", event.event_type)
            return

        for handler in handlers:
            try:
                start = _time.monotonic()
                await handler(event, db)
                elapsed = (_time.monotonic() - start) * 1000
                logger.info(
                    "EVENT_HANDLED: handler=%s event=%s elapsed=%.1fms",
                    handler.__name__, event.event_id, elapsed,
                )
            except Exception as exc:
                logger.error(
                    "EVENT_HANDLER_FAILED: handler=%s event=%s error=%s",
                    handler.__name__, event.event_id, str(exc),
                    exc_info=True,
                )


# ============================================================
# Event Store (DB persistence)
# ============================================================

class EventStore:
    """Persists events to the event_log table for audit and replay."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def persist(self, event: EventPayload, status: str = "COMPLETED") -> None:
        """Save an event to the event_log table."""
        from app.models.event_log import EventLog
        log = EventLog(
            event_id=event.event_id,
            event_type=event.event_type,
            source_module=event.source_module,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            hospital_id=event.hospital_id,
            group_id=event.group_id,
            patient_id=event.patient_id,
            doctor_id=event.doctor_id,
            triggered_by=event.triggered_by,
            correlation_id=event.correlation_id,
            payload_json=str(event.payload) if event.payload else None,
            metadata_json=str(event.metadata) if event.metadata else None,
            status=status,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(log)
        await self.db.flush()

    async def update_status(
        self,
        event_id: str,
        status: str,
        error_message: Optional[str] = None,
        processing_time_ms: Optional[float] = None,
    ) -> None:
        """Update event status after processing."""
        from app.models.event_log import EventLog
        from sqlalchemy import update
        stmt = update(EventLog).where(EventLog.event_id == event_id).values(
            status=status,
            processed_at=datetime.now(timezone.utc),
            error_message=error_message,
            processing_time_ms=processing_time_ms,
        )
        await self.db.execute(stmt)

    async def get_pending(self, limit: int = 50) -> list:
        """Get pending events for retry processing."""
        from app.models.event_log import EventLog
        from sqlalchemy import select
        query = select(EventLog).where(
            EventLog.status.in_(["PENDING", "FAILED", "RETRYING"])
        ).order_by(EventLog.created_at.asc()).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_failed(self, limit: int = 50) -> list:
        """Get failed events."""
        from app.models.event_log import EventLog
        from sqlalchemy import select
        query = select(EventLog).where(
            EventLog.status == "FAILED"
        ).order_by(EventLog.created_at.desc()).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_statistics(self) -> dict:
        """Get event processing statistics."""
        from app.models.event_log import EventLog
        from sqlalchemy import select, func
        today = datetime.now(timezone.utc).date()

        # Count by status
        status_query = select(EventLog.status, func.count()).group_by(EventLog.status)
        status_result = await self.db.execute(status_query)
        by_status = {row[0]: row[1] for row in status_result.all()}

        # Today's count
        today_query = select(func.count()).where(
            func.date(EventLog.created_at) == today
        )
        today_result = await self.db.execute(today_query)
        today_count = today_result.scalar() or 0

        # Average processing time
        avg_query = select(func.avg(EventLog.processing_time_ms)).where(
            EventLog.processing_time_ms.isnot(None)
        )
        avg_result = await self.db.execute(avg_query)
        avg_time = avg_result.scalar()

        return {
            "today_count": today_count,
            "by_status": by_status,
            "total": sum(by_status.values()),
            "avg_processing_time_ms": round(avg_time, 1) if avg_time else None,
            "pending": by_status.get("PENDING", 0),
            "completed": by_status.get("COMPLETED", 0),
            "failed": by_status.get("FAILED", 0),
            "retrying": by_status.get("RETRYING", 0),
        }


# ============================================================
# Global Dispatcher Singleton
# ============================================================

_global_dispatcher: Optional[EventDispatcher] = None


def get_dispatcher() -> EventDispatcher:
    """Get or create the global event dispatcher singleton."""
    global _global_dispatcher
    if _global_dispatcher is None:
        _global_dispatcher = EventDispatcher()
    return _global_dispatcher


def get_publisher() -> EventPublisher:
    """Get a publisher wired to the global dispatcher."""
    return EventPublisher(dispatcher=get_dispatcher())
