"""Event Service — orchestrates event publishing, processing, and monitoring."""
from __future__ import annotations
import json
import logging
import time as _time
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update

from app.crm.events import EventPayload, EventStore, get_publisher, get_dispatcher
from app.crm.enums import EventType, EventStatus

logger = logging.getLogger("crm.event_service")


class EventService:
    """Central orchestration service for CRM events."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.store = EventStore(db)
        self.publisher = get_publisher()

    async def publish_and_process(
        self,
        event_type: EventType | str,
        source_module: str,
        entity_type: str,
        entity_id: str,
        hospital_id: Optional[str] = None,
        group_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        doctor_id: Optional[str] = None,
        triggered_by: Optional[str] = None,
        payload: Optional[dict] = None,
        metadata: Optional[dict] = None,
    ) -> EventPayload:
        """Publish event, persist to store, and process through CRM engine."""
        start = _time.monotonic()

        # 1. Create event
        event = EventPayload(
            event_type=str(event_type),
            source_module=source_module,
            entity_type=entity_type,
            entity_id=entity_id,
            hospital_id=hospital_id,
            group_id=group_id,
            patient_id=patient_id,
            doctor_id=doctor_id,
            triggered_by=triggered_by,
            payload=payload or {},
            metadata=metadata or {},
        )

        # 2. Persist to event log
        await self.store.persist(event, status="PROCESSING")

        # 3. Process through CRM rule engine
        try:
            from app.crm.services.rule_engine import execute_rules
            if event.hospital_id:
                await execute_rules(
                    self.db,
                    event.hospital_id,
                    event.event_type,
                    event.payload or {},
                )
            elapsed = (_time.monotonic() - start) * 1000
            await self.store.update_status(event.event_id, "COMPLETED", processing_time_ms=elapsed)
            logger.info("EVENT_PROCESSED: %s in %.1fms", event.event_id, elapsed)
        except Exception as exc:
            elapsed = (_time.monotonic() - start) * 1000
            await self.store.update_status(
                event.event_id, "FAILED",
                error_message=str(exc),
                processing_time_ms=elapsed,
            )
            logger.error("EVENT_PROCESSING_FAILED: %s error=%s", event.event_id, str(exc), exc_info=True)

        return event

    async def get_events(
        self,
        event_type: Optional[str] = None,
        source_module: Optional[str] = None,
        status: Optional[str] = None,
        hospital_id: Optional[str] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> dict:
        """List events with filtering."""
        from app.models.event_log import EventLog
        query = select(EventLog)
        count_query = select(func.count()).select_from(EventLog)

        if event_type:
            query = query.where(EventLog.event_type == event_type)
            count_query = count_query.where(EventLog.event_type == event_type)
        if source_module:
            query = query.where(EventLog.source_module == source_module)
            count_query = count_query.where(EventLog.source_module == source_module)
        if status:
            query = query.where(EventLog.status == status)
            count_query = count_query.where(EventLog.status == status)
        if hospital_id:
            query = query.where(EventLog.hospital_id == hospital_id)
            count_query = count_query.where(EventLog.hospital_id == hospital_id)
        if entity_type:
            query = query.where(EventLog.entity_type == entity_type)
            count_query = count_query.where(EventLog.entity_type == entity_type)
        if entity_id:
            query = query.where(EventLog.entity_id == entity_id)
            count_query = count_query.where(EventLog.entity_id == entity_id)

        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.order_by(EventLog.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(query)
        items = [self._log_to_dict(e) for e in result.scalars().all()]

        return {"items": items, "total": total}

    async def get_event(self, event_id: str) -> Optional[dict]:
        """Get a single event by event_id."""
        from app.models.event_log import EventLog
        query = select(EventLog).where(EventLog.event_id == event_id)
        result = await self.db.execute(query)
        event = result.scalar_one_or_none()
        return self._log_to_dict(event) if event else None

    async def retry_event(self, event_id: str) -> Optional[dict]:
        """Retry a failed event through the CRM engine."""
        from app.models.event_log import EventLog
        query = select(EventLog).where(EventLog.event_id == event_id)
        result = await self.db.execute(query)
        event = result.scalar_one_or_none()
        if not event:
            return None
        if event.status not in ("FAILED", "RETRYING", "PENDING"):
            return {"error": f"Cannot retry event with status {event.status}"}

        # Update retry count
        event.retry_count = (event.retry_count or 0) + 1
        event.status = "RETRYING"
        await self.db.flush()

        # Re-process through CRM rule engine
        start = _time.monotonic()
        try:
            from app.crm.services.rule_engine import execute_rules
            if event.hospital_id:
                payload = json.loads(event.payload_json) if event.payload_json else {}
                await execute_rules(
                    self.db,
                    event.hospital_id,
                    event.event_type,
                    payload,
                )
            elapsed = (_time.monotonic() - start) * 1000
            event.status = "COMPLETED"
            event.processed_at = datetime.now(timezone.utc)
            event.processing_time_ms = elapsed
            await self.db.flush()
            return self._log_to_dict(event)
        except Exception as exc:
            elapsed = (_time.monotonic() - start) * 1000
            event.status = "FAILED"
            event.error_message = str(exc)
            event.processing_time_ms = elapsed
            await self.db.flush()
            return {"error": str(exc), "retry_count": event.retry_count}

    async def replay_event(self, event_id: str) -> Optional[dict]:
        """Replay an event — re-publish and re-process from scratch."""
        from app.models.event_log import EventLog
        query = select(EventLog).where(EventLog.event_id == event_id)
        result = await self.db.execute(query)
        old_event = result.scalar_one_or_none()
        if not old_event:
            return None

        # Create a new event with same data
        new_event = await self.publish_and_process(
            event_type=old_event.event_type,
            source_module=old_event.source_module,
            entity_type=old_event.entity_type,
            entity_id=old_event.entity_id,
            hospital_id=old_event.hospital_id,
            patient_id=old_event.patient_id,
            doctor_id=old_event.doctor_id,
            triggered_by=old_event.triggered_by,
            payload=json.loads(old_event.payload_json) if old_event.payload_json else None,
        )
        return self._log_to_dict(new_event)

    async def get_statistics(self) -> dict:
        """Get event processing statistics."""
        return await self.store.get_statistics()

    def _log_to_dict(self, log) -> dict:
        return {
            "id": log.id,
            "event_id": log.event_id,
            "event_type": log.event_type,
            "source_module": log.source_module,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "hospital_id": log.hospital_id,
            "patient_id": log.patient_id,
            "doctor_id": log.doctor_id,
            "triggered_by": log.triggered_by,
            "correlation_id": log.correlation_id,
            "payload": log.payload_json,
            "status": log.status,
            "processing_time_ms": log.processing_time_ms,
            "error_message": log.error_message,
            "retry_count": log.retry_count,
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "processed_at": log.processed_at.isoformat() if log.processed_at else None,
        }
