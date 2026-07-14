from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, exists
from sqlalchemy.orm import selectinload
from app.repositories.base import BaseRepository
from app.models.patient import Patient
from app.models.case import Case
from app.models.treatment_plan import TreatmentPlan
from app.models.billing import Billing


class PatientRepository(BaseRepository[Patient]):
    def __init__(self, db: AsyncSession):
        super().__init__(Patient, db)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: Optional[Dict[str, Any]] = None, order_by: Optional[str] = None, descending: bool = False) -> List[Patient]:
        query = select(self.model)
        if filters:
            for key, value in filters.items():
                if value is None or value == "":
                    continue
                if key == "search" and value:
                    search_val = f"%{value}%"
                    query = query.where(
                        or_(
                            Patient.full_name.ilike(search_val),
                            Patient.phone.ilike(search_val),
                            Patient.email.ilike(search_val),
                            Patient.op_no.ilike(search_val),
                            Patient.abha_id.ilike(search_val),
                            Patient.address.ilike(search_val),
                        )
                    )
                elif key == "op_no" and value:
                    query = query.where(Patient.op_no.ilike(f"%{value}%"))
                elif key == "phone" and value:
                    query = query.where(Patient.phone.ilike(f"%{value}%"))
                elif key == "abha_id" and value:
                    query = query.where(Patient.abha_id.ilike(f"%{value}%"))
                elif key == "age_from" and value is not None:
                    query = query.where(Patient.age >= value)
                elif key == "age_to" and value is not None:
                    query = query.where(Patient.age <= value)
                elif key == "created_at_from" and value:
                    from datetime import datetime
                    dt = datetime.fromisoformat(value) if isinstance(value, str) else value
                    query = query.where(Patient.created_at >= dt)
                elif key == "created_at_to" and value:
                    from datetime import datetime
                    dt = datetime.fromisoformat(value) if isinstance(value, str) else value
                    query = query.where(Patient.created_at <= dt)
                elif key == "last_visit_from" and value:
                    subq = select(Case.patient_id).where(Case.created_at >= value).distinct()
                    query = query.where(Patient.id.in_(subq))
                elif key == "last_visit_to" and value:
                    subq = select(Case.patient_id).where(Case.created_at <= value).distinct()
                    query = query.where(Patient.id.in_(subq))
                elif key == "case_status" and value:
                    subq = select(Case.patient_id).where(Case.status == value).distinct()
                    query = query.where(Patient.id.in_(subq))
                elif key == "treatment_status" and value:
                    subq = (
                        select(Case.patient_id)
                        .join(TreatmentPlan, TreatmentPlan.case_id == Case.id)
                        .where(TreatmentPlan.status == value)
                        .distinct()
                    )
                    query = query.where(Patient.id.in_(subq))
                elif key == "billing_status" and value:
                    subq = (
                        select(Case.patient_id)
                        .join(Billing, Billing.case_id == Case.id)
                        .where(Billing.payment_status == value)
                        .distinct()
                    )
                    query = query.where(Patient.id.in_(subq))
                elif key == "patient_source" and value:
                    query = query.where(Patient.patient_source.ilike(f"%{value}%"))
                elif key.endswith("__in") and isinstance(value, (list, tuple)):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name).in_(value))
                elif key.endswith("__ge"):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name) >= value)
                elif key.endswith("__gt"):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name) > value)
                elif key.endswith("__le"):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name) <= value)
                elif key.endswith("__lt"):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name) < value)
                elif hasattr(self.model, key) and value is not None:
                    query = query.where(getattr(self.model, key) == value)
        if order_by and hasattr(self.model, order_by):
            order_col = getattr(self.model, order_by)
            query = query.order_by(order_col.desc() if descending else order_col)
        else:
            query = query.order_by(Patient.created_at.desc())
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count(self, filters: Optional[Dict[str, Any]] = None) -> int:
        query = select(self.model.id)
        if filters:
            for key, value in filters.items():
                if value is None or value == "":
                    continue
                if key == "search" and value:
                    search_val = f"%{value}%"
                    query = query.where(
                        or_(
                            Patient.full_name.ilike(search_val),
                            Patient.phone.ilike(search_val),
                            Patient.email.ilike(search_val),
                            Patient.op_no.ilike(search_val),
                            Patient.abha_id.ilike(search_val),
                            Patient.address.ilike(search_val),
                        )
                    )
                elif key == "op_no" and value:
                    query = query.where(Patient.op_no.ilike(f"%{value}%"))
                elif key == "phone" and value:
                    query = query.where(Patient.phone.ilike(f"%{value}%"))
                elif key == "abha_id" and value:
                    query = query.where(Patient.abha_id.ilike(f"%{value}%"))
                elif key == "age_from" and value is not None:
                    query = query.where(Patient.age >= value)
                elif key == "age_to" and value is not None:
                    query = query.where(Patient.age <= value)
                elif key == "created_at_from" and value:
                    from datetime import datetime
                    dt = datetime.fromisoformat(value) if isinstance(value, str) else value
                    query = query.where(Patient.created_at >= dt)
                elif key == "created_at_to" and value:
                    from datetime import datetime
                    dt = datetime.fromisoformat(value) if isinstance(value, str) else value
                    query = query.where(Patient.created_at <= dt)
                elif key == "case_status" and value:
                    subq = select(Case.patient_id).where(Case.status == value).distinct()
                    query = query.where(Patient.id.in_(subq))
                elif key == "treatment_status" and value:
                    subq = (
                        select(Case.patient_id)
                        .join(TreatmentPlan, TreatmentPlan.case_id == Case.id)
                        .where(TreatmentPlan.status == value)
                        .distinct()
                    )
                    query = query.where(Patient.id.in_(subq))
                elif key == "billing_status" and value:
                    subq = (
                        select(Case.patient_id)
                        .join(Billing, Billing.case_id == Case.id)
                        .where(Billing.payment_status == value)
                        .distinct()
                    )
                    query = query.where(Patient.id.in_(subq))
                elif key == "patient_source" and value:
                    query = query.where(Patient.patient_source.ilike(f"%{value}%"))
                elif key.endswith("__in") and isinstance(value, (list, tuple)):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name).in_(value))
                elif hasattr(self.model, key) and value is not None:
                    query = query.where(getattr(self.model, key) == value)
        result = await self.db.execute(query)
        return len(result.all())
