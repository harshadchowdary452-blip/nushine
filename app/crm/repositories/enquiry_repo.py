"""Enquiry repository — all enquiry database operations."""
from __future__ import annotations
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.enquiry import Enquiry, EnquiryFollowUp


class EnquiryRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, enquiry_id: str) -> Optional[Enquiry]:
        return await self.db.get(Enquiry, enquiry_id)

    async def list(
        self,
        hospital_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[Enquiry], int]:
        query = select(Enquiry)
        count_query = select(func.count()).select_from(Enquiry)

        if hospital_id:
            query = query.where(Enquiry.hospital_id == hospital_id)
            count_query = count_query.where(Enquiry.hospital_id == hospital_id)
        if patient_id:
            query = query.where(Enquiry.patient_id == patient_id)
            count_query = count_query.where(Enquiry.patient_id == patient_id)
        if status:
            query = query.where(Enquiry.status == status)
            count_query = count_query.where(Enquiry.status == status)

        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.order_by(Enquiry.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_follow_ups(self, enquiry_id: str) -> list[EnquiryFollowUp]:
        query = select(EnquiryFollowUp).where(EnquiryFollowUp.enquiry_id == enquiry_id).order_by(EnquiryFollowUp.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, enquiry: Enquiry) -> Enquiry:
        self.db.add(enquiry)
        await self.db.flush()
        return enquiry

    async def update(self, enquiry: Enquiry) -> Enquiry:
        await self.db.flush()
        return enquiry
