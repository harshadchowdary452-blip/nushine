"""
CRM Event System — thin re-export layer.

All event routing goes through CentralEventDispatcher in event_dispatcher.py.
This module exists only for backward compatibility with existing callers.
"""
from app.crm.services.event_dispatcher import (
    EventPayload,
    CentralEventDispatcher,
    get_central_dispatcher,
    publish_event,
)

__all__ = [
    "EventPayload",
    "CentralEventDispatcher",
    "get_central_dispatcher",
    "publish_event",
    "get_dispatcher",
    "get_publisher",
]


# ============================================================
# Backward-compat shims — remove after all callers are migrated
# ============================================================

class _PublisherShim:
    """Compat shim: get_publisher().publish(...) wraps publish_event(...)."""

    async def publish(
        self,
        event_type,
        source_module,
        entity_type,
        entity_id,
        hospital_id=None,
        group_id=None,
        patient_id=None,
        doctor_id=None,
        triggered_by=None,
        correlation_id=None,
        payload=None,
        metadata=None,
        db=None,
    ):
        return await publish_event(
            event_type=event_type,
            source_module=source_module,
            entity_type=entity_type,
            entity_id=entity_id,
            hospital_id=hospital_id,
            patient_id=patient_id,
            doctor_id=doctor_id,
            triggered_by=triggered_by,
            payload=payload,
            db=db,
        )


def get_publisher():
    """Get a publisher shim — wraps publish_event() for backward compat."""
    return _PublisherShim()


class _DispatcherShim:
    """Compat shim: get_dispatcher() returns something with subscribe/subscribe_all."""

    def subscribe(self, event_type, handler):
        pass  # Legacy handlers are no longer wired

    def subscribe_all(self, handler):
        pass

    async def dispatch(self, event, db=None):
        pass


def get_dispatcher():
    """Get a no-op dispatcher shim for backward compat."""
    return _DispatcherShim()
