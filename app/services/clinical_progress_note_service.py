import logging
from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.clinical_progress_note import ClinicalProgressNote
from app.models.case import Case
from app.models.user import User

logger = logging.getLogger(__name__)


class ClinicalProgressNoteService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, case_id: str, doctor_id: str, data: dict) -> ClinicalProgressNote:
        case_result = await self.db.execute(select(Case).where(Case.id == case_id))
        case = case_result.scalar_one_or_none()
        if not case:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Case {case_id} not found")

        data.pop("case_id", None)
        note = ClinicalProgressNote(
            case_id=case_id,
            doctor_id=doctor_id,
            **data,
        )
        self.db.add(note)
        await self.db.flush()
        await self.db.refresh(note)
        return note

    async def get_by_case(self, case_id: str) -> List[ClinicalProgressNote]:
        result = await self.db.execute(
            select(ClinicalProgressNote)
            .where(ClinicalProgressNote.case_id == case_id)
            .order_by(ClinicalProgressNote.note_date)
        )
        notes = list(result.scalars().all())
        for note in notes:
            if note.doctor_id:
                doc_result = await self.db.execute(select(User).where(User.id == note.doctor_id))
                doc = doc_result.scalar_one_or_none()
                note.doctor_name = doc.full_name if doc else None
        return notes

    async def get(self, note_id: str) -> Optional[ClinicalProgressNote]:
        result = await self.db.execute(
            select(ClinicalProgressNote).where(ClinicalProgressNote.id == note_id)
        )
        note = result.scalar_one_or_none()
        if note and note.doctor_id:
            doc_result = await self.db.execute(select(User).where(User.id == note.doctor_id))
            doc = doc_result.scalar_one_or_none()
            note.doctor_name = doc.full_name if doc else None
        return note

    async def update(self, note_id: str, data: dict) -> Optional[ClinicalProgressNote]:
        result = await self.db.execute(
            select(ClinicalProgressNote).where(ClinicalProgressNote.id == note_id)
        )
        note = result.scalar_one_or_none()
        if not note:
            return None
        for key, value in data.items():
            if value is not None:
                setattr(note, key, value)
        await self.db.flush()
        await self.db.refresh(note)
        return note

    async def delete(self, note_id: str) -> bool:
        result = await self.db.execute(
            select(ClinicalProgressNote).where(ClinicalProgressNote.id == note_id)
        )
        note = result.scalar_one_or_none()
        if not note:
            return False
        await self.db.delete(note)
        await self.db.flush()
        return True
