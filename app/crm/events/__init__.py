"""
CRM Event System — re-export layer.

All event routing goes through CentralEventDispatcher in event_dispatcher.py.
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
]
