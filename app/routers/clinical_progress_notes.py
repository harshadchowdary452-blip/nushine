import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.services.clinical_progress_note_service import ClinicalProgressNoteService
from app.schemas.clinical_progress_note import (
    ClinicalProgressNoteCreate, ClinicalProgressNoteUpdate, ClinicalProgressNoteResponse,
)
from app.schemas.common import MessageResponse
from app.models.case import Case
from app.models.patient import Patient
from sqlalchemy import select
from app.services.timeline_helper import record_timeline_event

router = APIRouter(prefix="/clinical-progress-notes", tags=["Clinical Progress Notes"])
logger = logging.getLogger(__name__)


@router.get("/by-case/{case_id}", response_model=List[ClinicalProgressNoteResponse])
async def get_notes_by_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES, Permission.VIEW_ALL_PATIENTS)
    service = ClinicalProgressNoteService(db)
    return await service.get_by_case(case_id)


@router.post("/", response_model=ClinicalProgressNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(data: ClinicalProgressNoteCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = ClinicalProgressNoteService(db)
    note = await service.create(data.case_id, current_user.get("sub"), data.model_dump())
    await db.commit()
    case_result = await db.execute(select(Case.patient_id).where(Case.id == data.case_id))
    case_row = case_result.one_or_none()
    if case_row:
        await record_timeline_event(
            db, current_user=current_user, patient_id=case_row[0],
            action="Clinical Progress Note Added",
            description=f"Clinical progress note added",
            module="Case Reports",
        )
    return note


@router.get("/{note_id}", response_model=ClinicalProgressNoteResponse)
async def get_note(note_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = ClinicalProgressNoteService(db)
    note = await service.get(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Clinical progress note not found")
    return note


@router.put("/{note_id}", response_model=ClinicalProgressNoteResponse)
async def update_note(note_id: str, data: ClinicalProgressNoteUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = ClinicalProgressNoteService(db)
    note = await service.update(note_id, data.model_dump(exclude_none=True))
    if not note:
        raise HTTPException(status_code=404, detail="Clinical progress note not found")
    await db.commit()
    return note


@router.delete("/{note_id}", response_model=MessageResponse)
async def delete_note(note_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = ClinicalProgressNoteService(db)
    deleted = await service.delete(note_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Clinical progress note not found")
    await db.commit()
    return MessageResponse(message="Clinical progress note deleted")
