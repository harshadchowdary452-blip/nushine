from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from sqlalchemy import select
from app.models.case import Case
from app.services.consultant_note_service import ConsultantNoteService
from app.services.timeline_helper import record_timeline_event
from app.schemas.consultant_note import ConsultantNoteCreate, ConsultantNoteResponse

router = APIRouter(prefix="/consultant-notes", tags=["Consultant Notes"])


@router.post("/", response_model=ConsultantNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(data: ConsultantNoteCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.ASSIGN_CONSULTANT)
    service = ConsultantNoteService(db)
    note = await service.create(data.model_dump(), user_id=current_user.get("sub"))
    case_result = await db.execute(select(Case).where(Case.id == data.case_id))
    case_obj = case_result.scalar_one_or_none()
    if case_obj:
        await record_timeline_event(
            db, current_user=current_user, patient_id=case_obj.patient_id,
            action="Consultant Note Added",
            description=f"Consultant note added",
            module="Treatments",
        )
    return note


@router.get("/by-case/{case_id}")
async def get_notes_by_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.ASSIGN_CONSULTANT, Permission.MANAGE_CASES)
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case_obj = case_result.scalar_one_or_none()
    if not case_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case_obj, "case", db)
    service = ConsultantNoteService(db)
    return await service.get_by_case(case_id)
