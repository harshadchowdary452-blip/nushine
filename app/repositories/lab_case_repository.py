from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.lab_case import LabCase


class LabCaseRepository(BaseRepository[LabCase]):
    def __init__(self, db: AsyncSession):
        super().__init__(LabCase, db)
