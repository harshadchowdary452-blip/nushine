from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status
from app.repositories.hospital_repository import HospitalRepository
from app.repositories.user_repository import UserRepository
from app.repositories.patient_repository import PatientRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.hospital import Hospital
from app.core.permissions import Role


class HospitalService:
    def __init__(self, db: AsyncSession):
        self.repo = HospitalRepository(db)
        self.user_repo = UserRepository(db)
        self.patient_repo = PatientRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> Hospital:
        import logging
        logger = logging.getLogger(__name__)
        logger.info("CREATE_HOSPITAL - Request data: %s", data)
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        if "admin_group_id" not in clean_data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="admin_group_id is required")
        try:
            hospital = await self.repo.create(**clean_data)
            logger.info("CREATE_HOSPITAL - Success: %s", hospital.id)
        except IntegrityError as e:
            logger.error("CREATE_HOSPITAL - Integrity error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Database integrity error: {str(e.orig)}")
        except Exception as e:
            logger.exception("CREATE_HOSPITAL - Unexpected error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create hospital: {str(e)}")
        await self.audit_log_repo.create(user_id=user_id, action="CREATE_HOSPITAL", entity_type="HOSPITAL", entity_id=str(hospital.id), details=f"Hospital '{hospital.name}' created")
        await self._populate_inventory(hospital.id)
        return hospital

    async def _populate_inventory(self, hospital_id: str):
        """Every new hospital automatically receives the complete master inventory list."""
        from app.services.hospital_inventory_service import HospitalInventoryService

        try:
            await HospitalInventoryService(self.db).sync_master_items_for_hospital(hospital_id)
            await self.db.flush()
        except Exception as e:  # noqa: BLE001 — auto-population must never block hospital creation
            logging.getLogger(__name__).exception("Failed to auto-populate inventory for %s: %s", hospital_id, str(e))

    async def get(self, hospital_id: str) -> Optional[Hospital]:
        return await self.repo.get(hospital_id)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[Hospital]:
        return await self.repo.get_all(skip=skip, limit=limit, filters=filters)

    async def update(self, hospital_id: str, data: dict, user_id: str = None) -> Optional[Hospital]:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        hospital = await self.repo.update(hospital_id, **clean_data)
        if hospital:
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_HOSPITAL", entity_type="HOSPITAL", entity_id=hospital_id, details="Hospital updated")
        return hospital

async def delete(self, hospital_id: str, user_id: str = None) -> bool:
    import logging
    from sqlalchemy import select, func
    from app.models.user import User
    from app.models.patient import Patient
    from app.models.consultant import Consultant
    from app.models.hospital_monthly_expense import HospitalMonthlyExpense as Expense
    from app.models.lead import Lead
    logger = logging.getLogger(__name__)
    try:
        # Pre-delete check to give a clear error message
        counts = {}
        counts["users"] = (await self.db.execute(select(func.count()).select_from(User).where(User.hospital_id == hospital_id))).scalar()
        counts["patients"] = (await self.db.execute(select(func.count()).select_from(Patient).where(Patient.hospital_id == hospital_id))).scalar()
        counts["consultants"] = (await self.db.execute(select(func.count()).select_from(Consultant).where(Consultant.hospital_id == hospital_id))).scalar()
        counts["expenses"] = (await self.db.execute(select(func.count()).select_from(Expense).where(Expense.hospital_id == hospital_id))).scalar()
        counts["leads"] = (await self.db.execute(select(func.count()).select_from(Lead).where(Lead.hospital_id == hospital_id))).scalar()
        active = {k: v for k, v in counts.items() if v > 0}
        if active:
            detail = "Cannot delete hospital with associated records: " + ", ".join(f"{k} ({v})" for k, v in active.items())
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
        result = await self.repo.delete(hospital_id)
        if result:
            await self.audit_log_repo.create(user_id=user_id, action="DELETE_HOSPITAL", entity_type="HOSPITAL", entity_id=hospital_id, details="Hospital deleted")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("DELETE_HOSPITAL - Unexpected error: %s", str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete hospital: {str(e)}")

    async def get_analytics(self, hospital_id: str = None) -> Dict[str, Any]:
        return {"total_hospitals": 1 if hospital_id else await self.repo.count(), "total_doctors": await self.user_repo.count({"hospital_id": hospital_id, "role": Role.DOCTOR.value}) if hospital_id else 0, "total_patients": await self.patient_repo.count({"hospital_id": hospital_id}) if hospital_id else 0}
