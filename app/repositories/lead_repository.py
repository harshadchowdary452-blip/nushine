from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.lead import Lead, LeadCommunication, LeadCall


class LeadRepository(BaseRepository[Lead]):
    def __init__(self, db: AsyncSession):
        super().__init__(Lead, db)


class LeadCommunicationRepository(BaseRepository[LeadCommunication]):
    def __init__(self, db: AsyncSession):
        super().__init__(LeadCommunication, db)


class LeadCallRepository(BaseRepository[LeadCall]):
    def __init__(self, db: AsyncSession):
        super().__init__(LeadCall, db)
