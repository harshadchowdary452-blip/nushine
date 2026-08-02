import os, json, logging
from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.repositories.consent_form_repository import ConsentFormRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.consent_form import ConsentForm
from app.models.patient import Patient
from app.models.user import User
from app.models.hospital import Hospital
from app.config import settings

logger = logging.getLogger(__name__)


class ConsentFormService:
    def __init__(self, db: AsyncSession):
        self.repo = ConsentFormRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def _enrich(self, cf: ConsentForm):
        if cf.doctor_id:
            dr = await self.db.execute(select(User).where(User.id == cf.doctor_id))
            u = dr.scalar_one_or_none()
            if u:
                cf.doctor_name = u.full_name
        if cf.uploaded_by:
            up = await self.db.execute(select(User).where(User.id == cf.uploaded_by))
            u = up.scalar_one_or_none()
            if u:
                cf.uploader_name = u.full_name
        return cf

    async def create(self, data: dict, pdf_path: str, user_id: str) -> ConsentForm:
        try:
            hospital_id = data.get("hospital_id")
            if not hospital_id:
                raise HTTPException(status_code=400, detail="hospital_id is required")

            data["pdf_path"] = pdf_path
            data["uploaded_by"] = user_id

            cf = await self.repo.create(**data)
            await self._enrich(cf)
            await self.audit_log_repo.create(
                user_id=user_id, action="CREATE_CONSENT_FORM",
                entity_type="CONSENT_FORM", entity_id=str(cf.id),
                details=f"Consent form '{cf.consent_type}' uploaded for patient '{cf.patient_name}'"
            )
            return cf
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("CREATE_CONSENT_FORM - Error: %s", str(e))
            raise HTTPException(status_code=500, detail="Failed to create consent form")

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[ConsentForm]:
        items = await self.repo.get_all(skip=skip, limit=limit, filters=filters)
        for item in items:
            await self._enrich(item)
        return items

    async def get(self, cf_id: str) -> Optional[ConsentForm]:
        cf = await self.repo.get(cf_id)
        if cf:
            await self._enrich(cf)
        return cf

    async def get_by_patient(self, patient_id: str) -> List[ConsentForm]:
        items = await self.repo.get_all(filters={"patient_id": patient_id, "is_deleted": False})
        for item in items:
            await self._enrich(item)
        return items

    async def get_by_case(self, case_id: str) -> List[ConsentForm]:
        items = await self.repo.get_all(filters={"case_id": case_id, "is_deleted": False})
        for item in items:
            await self._enrich(item)
        return items

    async def get_by_treatment(self, treatment_plan_id: str) -> List[ConsentForm]:
        items = await self.repo.get_all(filters={"treatment_plan_id": treatment_plan_id, "is_deleted": False})
        for item in items:
            await self._enrich(item)
        return items

    async def update(self, cf_id: str, data: dict, user_id: str) -> Optional[ConsentForm]:
        try:
            cf = await self.repo.get(cf_id)
            if not cf:
                return None
            old_type = cf.consent_type
            cf = await self.repo.update(cf_id, **data)
            await self._enrich(cf)
            await self.audit_log_repo.create(
                user_id=user_id, action="UPDATE_CONSENT_FORM",
                entity_type="CONSENT_FORM", entity_id=cf_id,
                details=f"Consent form updated: {old_type} -> {data.get('consent_type', old_type)}"
            )
            return cf
        except Exception as e:
            logger.exception("UPDATE_CONSENT_FORM - Error: %s", str(e))
            raise HTTPException(status_code=500, detail=f"Failed to update consent form: {str(e)}")

    async def replace_pdf(self, cf_id: str, pdf_path: str, user_id: str) -> Optional[ConsentForm]:
        try:
            cf = await self.repo.get(cf_id)
            if not cf:
                return None
            old_path = cf.pdf_path
            cf = await self.repo.update(cf_id, pdf_path=pdf_path)
            if old_path and os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except OSError:
                    pass
            await self._enrich(cf)
            await self.audit_log_repo.create(
                user_id=user_id, action="REPLACE_CONSENT_FORM_PDF",
                entity_type="CONSENT_FORM", entity_id=cf_id,
                details=f"PDF replaced for consent form '{cf.consent_type}'"
            )
            return cf
        except Exception as e:
            logger.exception("REPLACE_CONSENT_FORM_PDF - Error: %s", str(e))
            raise HTTPException(status_code=500, detail=f"Failed to replace PDF: {str(e)}")

    async def soft_delete(self, cf_id: str, user_id: str) -> bool:
        try:
            cf = await self.repo.get(cf_id)
            if not cf:
                return False
            now = datetime.now(timezone.utc)
            await self.repo.update(cf_id, is_deleted=True, deleted_at=now, deleted_by=user_id)
            await self.audit_log_repo.create(
                user_id=user_id, action="DELETE_CONSENT_FORM",
                entity_type="CONSENT_FORM", entity_id=cf_id,
                details=f"Consent form '{cf.consent_type}' for patient '{cf.patient_name}' deleted"
            )
            return True
        except Exception as e:
            logger.exception("DELETE_CONSENT_FORM - Error: %s", str(e))
            raise HTTPException(status_code=500, detail=f"Failed to delete consent form: {str(e)}")

    async def restore(self, cf_id: str, user_id: str) -> Optional[ConsentForm]:
        try:
            cf = await self.repo.get(cf_id)
            if not cf:
                return None
            await self.repo.update(cf_id, is_deleted=False, deleted_at=None, deleted_by=None)
            await self._enrich(cf)
            await self.audit_log_repo.create(
                user_id=user_id, action="RESTORE_CONSENT_FORM",
                entity_type="CONSENT_FORM", entity_id=cf_id,
                details=f"Consent form '{cf.consent_type}' for patient '{cf.patient_name}' restored"
            )
            return cf
        except Exception as e:
            logger.exception("RESTORE_CONSENT_FORM - Error: %s", str(e))
            raise HTTPException(status_code=500, detail=f"Failed to restore consent form: {str(e)}")

    async def get_stats(self, hospital_id: str) -> dict:
        total = await self.repo.count(filters={"hospital_id": hospital_id, "is_deleted": False})
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        this_month = await self.repo.count(filters={"hospital_id": hospital_id, "is_deleted": False, "date_from": month_start})
        recent = await self.repo.get_all(
            limit=5, filters={"hospital_id": hospital_id, "is_deleted": False}
        )
        recent_list = []
        for r in recent:
            recent_list.append({
                "id": r.id, "patient_name": r.patient_name,
                "consent_type": r.consent_type, "created_at": r.created_at.isoformat() if r.created_at else None,
            })
        return {
            "total": total,
            "this_month": this_month,
            "recent": recent_list,
        }

    async def log_view(self, cf_id: str, user_id: str):
        try:
            cf = await self.repo.get(cf_id)
            if cf:
                await self.audit_log_repo.create(
                    user_id=user_id, action="VIEW_CONSENT_FORM",
                    entity_type="CONSENT_FORM", entity_id=cf_id,
                    details=f"Consent form '{cf.consent_type}' for patient '{cf.patient_name}' viewed"
                )
        except Exception:
            pass

    async def log_download(self, cf_id: str, user_id: str):
        try:
            cf = await self.repo.get(cf_id)
            if cf:
                await self.audit_log_repo.create(
                    user_id=user_id, action="DOWNLOAD_CONSENT_FORM",
                    entity_type="CONSENT_FORM", entity_id=cf_id,
                    details=f"Consent form '{cf.consent_type}' for patient '{cf.patient_name}' downloaded"
                )
        except Exception:
            pass
