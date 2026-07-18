"""Event Monitor API — endpoints for viewing and managing CRM events."""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user
from app.crm.services.event_service import EventService
from app.crm.utils import get_hospital_filter
from app.crm.schemas import success_response, paginated_response

router = APIRouter(prefix="/events", tags=["CRM Events"])


@router.get("")
async def list_events(
    event_type: Optional[str] = None,
    source_module: Optional[str] = None,
    status: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = get_hospital_filter(current_user)
    svc = EventService(db)
    result = await svc.get_events(
        event_type=event_type, source_module=source_module,
        status=status, hospital_id=hospital_id,
        entity_type=entity_type, entity_id=entity_id,
        skip=skip, limit=limit,
    )
    return paginated_response(result["items"], result["total"], (skip // limit) + 1, limit)


@router.get("/pending")
async def list_pending_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = EventService(db)
    result = await svc.get_events(status="PENDING", skip=skip, limit=limit)
    return paginated_response(result["items"], result["total"], (skip // limit) + 1, limit)


@router.get("/failed")
async def list_failed_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = EventService(db)
    result = await svc.get_events(status="FAILED", skip=skip, limit=limit)
    return paginated_response(result["items"], result["total"], (skip // limit) + 1, limit)


@router.get("/statistics")
async def get_event_statistics(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = EventService(db)
    stats = await svc.get_statistics()
    return success_response(stats)


@router.get("/{event_id}")
async def get_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = EventService(db)
    event = await svc.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return success_response(event)


@router.post("/retry/{event_id}")
async def retry_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = EventService(db)
    result = await svc.retry_event(event_id)
    if not result:
        raise HTTPException(status_code=404, detail="Event not found")
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return success_response(result, "Event retried successfully")


@router.post("/replay/{event_id}")
async def replay_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = EventService(db)
    result = await svc.replay_event(event_id)
    if not result:
        raise HTTPException(status_code=404, detail="Event not found")
    return success_response(result, "Event replayed successfully")
