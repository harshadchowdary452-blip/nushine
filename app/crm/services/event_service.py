"""Event Service — orchestrates event querying, retry, and monitoring."""
import json
import logging
import time as _time
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update

logger = logging.getLogger("crm.event_service")


class EventService:
    """Central orchestration service for CRM event monitoring."""

    def __init__(self, db: AsyncSession):
        self.db = db

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
        """Retry a failed event through the CentralEventDispatcher."""
        from app.models.event_log import EventLog
        from app.crm.services.event_dispatcher import get_central_dispatcher
        query = select(EventLog).where(EventLog.event_id == event_id)
        result = await self.db.execute(query)
        event = result.scalar_one_or_none()
        if not event:
            return None
        if event.status not in ("FAILED", "RETRYING", "PENDING"):
            return {"error": f"Cannot retry event with status {event.status}"}

        event.retry_count = (event.retry_count or 0) + 1
        event.status = "RETRYING"
        await self.db.flush()

        start = _time.monotonic()
        try:
            dispatcher = get_central_dispatcher()
            payload = json.loads(event.payload_json) if event.payload_json else {}
            await dispatcher.dispatch(
                event_type=event.event_type,
                source_module=event.source_module,
                entity_type=event.entity_type,
                entity_id=event.entity_id,
                hospital_id=event.hospital_id,
                patient_id=event.patient_id,
                doctor_id=event.doctor_id,
                triggered_by=event.triggered_by,
                payload=payload,
                db=self.db,
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
        """Replay an event — re-dispatch from scratch."""
        from app.models.event_log import EventLog
        from app.crm.services.event_dispatcher import get_central_dispatcher
        query = select(EventLog).where(EventLog.event_id == event_id)
        result = await self.db.execute(query)
        old_event = result.scalar_one_or_none()
        if not old_event:
            return None

        dispatcher = get_central_dispatcher()
        payload = json.loads(old_event.payload_json) if old_event.payload_json else {}
        await dispatcher.dispatch(
            event_type=old_event.event_type,
            source_module=old_event.source_module,
            entity_type=old_event.entity_type,
            entity_id=old_event.entity_id,
            hospital_id=old_event.hospital_id,
            patient_id=old_event.patient_id,
            doctor_id=old_event.doctor_id,
            triggered_by=old_event.triggered_by,
            payload=payload,
            db=self.db,
        )

        # Fetch the newly created event log
        new_query = select(EventLog).order_by(EventLog.created_at.desc()).limit(1)
        new_result = await self.db.execute(new_query)
        new_event = new_result.scalar_one_or_none()
        return self._log_to_dict(new_event) if new_event else None

    async def get_statistics(self) -> dict:
        """Get event processing statistics."""
        from app.models.event_log import EventLog
        today = datetime.now(timezone.utc).date()

        status_query = select(EventLog.status, func.count()).group_by(EventLog.status)
        status_result = await self.db.execute(status_query)
        by_status = {row[0]: row[1] for row in status_result.all()}

        today_query = select(func.count()).where(func.date(EventLog.created_at) == today)
        today_result = await self.db.execute(today_query)
        today_count = today_result.scalar() or 0

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
