from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.services.consultant_note_service import ConsultantNoteService
from app.schemas.consultant_note import ConsultantNoteCreate, ConsultantNoteResponse

router = APIRouter(prefix="/consultant-notes", tags=["Consultant Notes"])


@router.post("/", response_model=ConsultantNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(data: ConsultantNoteCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.ASSIGN_CONSULTANT)
    service = ConsultantNoteService(db)
    return await service.create(data.model_dump(), user_id=current_user.get("sub"))


@router.get("/by-case/{case_id}")
async def get_notes_by_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.ASSIGN_CONSULTANT, Permission.MANAGE_CASES)
    service = ConsultantNoteService(db)
    return await service.get_by_case(case_id)
