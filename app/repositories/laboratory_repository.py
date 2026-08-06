from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.laboratory import Laboratory


class LaboratoryRepository(BaseRepository[Laboratory]):
    def __init__(self, db: AsyncSession):
        super().__init__(Laboratory, db)
