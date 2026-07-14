from typing import Optional, List, Dict, Any
from datetime import date, time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from app.repositories.base import BaseRepository
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.user import User
from app.models.billing import Billing


class AppointmentRepository(BaseRepository[Appointment]):
    def __init__(self, db: AsyncSession):
        super().__init__(Appointment, db)

    async def get(self, id: Any) -> Optional[Appointment]:
        query = select(self.model).where(self.model.id == id).options(
            selectinload(self.model.patient),
            selectinload(self.model.doctor),
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_all(self, skip: int = 0, limit: int = 100, filters: Optional[Dict[str, Any]] = None, order_by: Optional[str] = None, descending: bool = False) -> List[Appointment]:
        query = select(self.model).options(
            selectinload(self.model.patient),
            selectinload(self.model.doctor),
        ).join(Patient, Appointment.patient_id == Patient.id, isouter=True)

        if filters:
            for key, value in filters.items():
                if value is None or value == "":
                    continue
                if key == "search" and value:
                    search_val = f"%{value}%"
                    query = query.where(
                        or_(
                            Patient.full_name.ilike(search_val),
                            Appointment.notes.ilike(search_val),
                            Appointment.appointment_number.ilike(search_val),
                            Patient.phone.ilike(search_val),
                            Patient.op_no.ilike(search_val),
                            Patient.abha_id.ilike(search_val),
                        )
                    )
                elif key == "patient_name" and value:
                    query = query.where(Patient.full_name.ilike(f"%{value}%"))
                elif key == "op_no" and value:
                    query = query.where(Patient.op_no.ilike(f"%{value}%"))
                elif key == "mobile" and value:
                    query = query.where(Patient.phone.ilike(f"%{value}%"))
                elif key == "abha_id" and value:
                    query = query.where(Patient.abha_id.ilike(f"%{value}%"))
                elif key == "date_from" and value:
                    query = query.where(Appointment.appointment_date >= value)
                elif key == "date_to" and value:
                    query = query.where(Appointment.appointment_date <= value)
                elif key == "time_from" and value:
                    query = query.where(Appointment.appointment_time >= value)
                elif key == "time_to" and value:
                    query = query.where(Appointment.appointment_time <= value)
                elif key == "payment_status" and value:
                    from app.models.case import Case as CaseModel
                    query = (
                        query.join(CaseModel, CaseModel.appointment_id == Appointment.id, isouter=True)
                        .join(Billing, Billing.case_id == CaseModel.id, isouter=True)
                        .where(Billing.payment_status == value)
                    )
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
            query = query.order_by(Appointment.appointment_date.desc(), Appointment.appointment_time.desc())

        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count(self, filters: Optional[Dict[str, Any]] = None) -> int:
        query = select(self.model.id).join(Patient, Appointment.patient_id == Patient.id, isouter=True)
        if filters:
            for key, value in filters.items():
                if value is None or value == "":
                    continue
                if key == "search" and value:
                    search_val = f"%{value}%"
                    query = query.where(
                        or_(
                            Patient.full_name.ilike(search_val),
                            Appointment.notes.ilike(search_val),
                            Appointment.appointment_number.ilike(search_val),
                            Patient.phone.ilike(search_val),
                            Patient.op_no.ilike(search_val),
                            Patient.abha_id.ilike(search_val),
                        )
                    )
                elif key == "patient_name" and value:
                    query = query.where(Patient.full_name.ilike(f"%{value}%"))
                elif key == "op_no" and value:
                    query = query.where(Patient.op_no.ilike(f"%{value}%"))
                elif key == "mobile" and value:
                    query = query.where(Patient.phone.ilike(f"%{value}%"))
                elif key == "abha_id" and value:
                    query = query.where(Patient.abha_id.ilike(f"%{value}%"))
                elif key == "date_from" and value:
                    query = query.where(Appointment.appointment_date >= value)
                elif key == "date_to" and value:
                    query = query.where(Appointment.appointment_date <= value)
                elif key == "time_from" and value:
                    query = query.where(Appointment.appointment_time >= value)
                elif key == "time_to" and value:
                    query = query.where(Appointment.appointment_time <= value)
                elif key == "payment_status" and value:
                    from app.models.case import Case as CaseModel
                    query = (
                        query.join(CaseModel, CaseModel.appointment_id == Appointment.id, isouter=True)
                        .join(Billing, Billing.case_id == CaseModel.id, isouter=True)
                        .where(Billing.payment_status == value)
                    )
                elif key.endswith("__in") and isinstance(value, (list, tuple)):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name).in_(value))
                elif hasattr(self.model, key) and value is not None:
                    query = query.where(getattr(self.model, key) == value)
        result = await self.db.execute(query)
        return len(result.all())
