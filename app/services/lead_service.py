import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.repositories.lead_repository import LeadRepository, LeadCommunicationRepository, LeadCallRepository
from app.repositories.audit_log_repository import AuditLogRepository

logger = logging.getLogger(__name__)


class LeadService:
    def __init__(self, db: AsyncSession):
        self.repo = LeadRepository(db)
        self.comm_repo = LeadCommunicationRepository(db)
        self.call_repo = LeadCallRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> object:
        try:
            clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
            lead = await self.repo.create(**clean_data)
            await self.audit_log_repo.create(
                user_id=user_id, action="CREATE_LEAD", entity_type="LEAD",
                entity_id=str(lead.id), details=f"Lead '{lead.lead_name}' created"
            )
            return lead
        except Exception as e:
            logger.exception("CREATE_LEAD - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create lead: {str(e)}")

    async def get(self, lead_id: str) -> Optional[object]:
        return await self.repo.get(lead_id)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> list:
        return await self.repo.get_all(skip=skip, limit=limit, filters=filters, order_by="created_at", descending=True)

    async def update(self, lead_id: str, data: dict, user_id: str = None) -> Optional[object]:
        try:
            lead = await self.repo.update(lead_id, **data)
            if lead:
                await self.audit_log_repo.create(
                    user_id=user_id, action="UPDATE_LEAD", entity_type="LEAD",
                    entity_id=lead_id, details="Lead updated"
                )
            return lead
        except Exception as e:
            logger.exception("UPDATE_LEAD - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update lead: {str(e)}")

    async def update_status(self, lead_id: str, status: str, user_id: str = None) -> Optional[object]:
        return await self.update(lead_id, {"status": status}, user_id=user_id)

    async def delete(self, lead_id: str, user_id: str = None) -> bool:
        try:
            result = await self.repo.delete(lead_id)
            if result:
                await self.audit_log_repo.create(
                    user_id=user_id, action="DELETE_LEAD", entity_type="LEAD",
                    entity_id=lead_id, details="Lead deleted"
                )
            return result
        except Exception as e:
            logger.exception("DELETE_LEAD - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete lead: {str(e)}")

    async def add_communication(self, lead_id: str, data: dict, user_id: str = None) -> object:
        lead = await self.repo.get(lead_id)
        if not lead:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        comm = await self.comm_repo.create(lead_id=lead_id, **data)
        await self.audit_log_repo.create(
            user_id=user_id, action="LEAD_COMMUNICATION", entity_type="LEAD",
            entity_id=lead_id, details=f"Communication sent via {data.get('channel', 'UNKNOWN')}"
        )
        return comm

    async def get_communications(self, lead_id: str) -> list:
        return await self.comm_repo.get_all(filters={"lead_id": lead_id})

    async def add_call(self, lead_id: str, data: dict, user_id: str = None) -> object:
        lead = await self.repo.get(lead_id)
        if not lead:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        call = await self.call_repo.create(lead_id=lead_id, called_by=user_id, **data)
        await self.audit_log_repo.create(
            user_id=user_id, action="LEAD_CALL", entity_type="LEAD",
            entity_id=lead_id, details=f"Call recorded with outcome: {data.get('outcome', 'UNKNOWN')}"
        )
        return call

    async def get_calls(self, lead_id: str) -> list:
        return await self.call_repo.get_all(filters={"lead_id": lead_id})

    async def convert(self, lead_id: str, data: dict, user_id: str = None) -> dict:
        from datetime import datetime, timezone
        from app.models.patient import Patient
        from app.models.cases import Case
        from app.models.lead import LeadStatus, Lead
        from sqlalchemy import select
        lead = await self.repo.get(lead_id)
        if not lead:
            return {"error": "Lead not found"}
        if lead.status == LeadStatus.CONVERTED.value:
            return {"error": "Lead already converted"}
        async with self.db.begin_nested():
            patient = Patient(
                patient_name=data.get("patient_name") or lead.lead_name,
                hospital_id=lead.hospital_id,
                age=data.get("age") or lead.age,
                gender=data.get("gender") or lead.gender,
                mobile=data.get("phone") or lead.mobile,
                email=data.get("email") or lead.email,
                city=data.get("city") or lead.city,
                source=f"LEAD-{lead.source}",
                notes=data.get("notes") or "",
            )
            self.db.add(patient)
            await self.db.flush()
            case = Case(
                patient_id=patient.id,
                doctor_id=data.get("doctor_id") or lead.assigned_doctor_id or "",
                hospital_id=lead.hospital_id,
                status="ACTIVE",
            )
            self.db.add(case)
            await self.db.flush()
            lead.converted_patient_id = patient.id
            lead.status = LeadStatus.CONVERTED.value
            lead.last_contacted_at = datetime.now(timezone.utc)
            await self.db.flush()
        await self.audit_log_repo.create(
            user_id=user_id, action="CONVERT_LEAD", entity_type="LEAD",
            entity_id=lead_id, details=f"Lead '{lead.lead_name}' converted to patient {patient.id}"
        )
        return {
            "message": "Lead converted successfully",
            "patient_id": patient.id,
            "case_id": case.id,
            "lead_id": lead_id,
        }
