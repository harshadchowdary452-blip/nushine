import asyncio
import logging
import traceback
logging.basicConfig(level=logging.DEBUG)

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload, joinedload
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.case import Case
from app.models.patient import Patient
from app.models.user import User
from app.models.hospital import Hospital

DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/nushine"
engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def test():
    async with SessionLocal() as db:
        try:
            query = (
                select(TreatmentPlan)
                .join(Case, TreatmentPlan.case_id == Case.id)
                .outerjoin(Patient, Case.patient_id == Patient.id)
                .outerjoin(User, TreatmentPlan.assigned_doctor_id == User.id, isouter=True)
                .options(
                    selectinload(TreatmentPlan.sittings),
                    joinedload(TreatmentPlan.case).joinedload(Case.patient).selectinload(Patient.hospital),
                    joinedload(TreatmentPlan.case).joinedload(Case.doctor),
                    joinedload(TreatmentPlan.assigned_doctor),
                    joinedload(TreatmentPlan.assistant_doctor),
                    joinedload(TreatmentPlan.treatment_type),
                )
            )
            query = query.where(TreatmentPlan.is_active == True)
            
            count_query = select(func.count()).select_from(query.subquery())
            total_result = await db.execute(count_query)
            total = total_result.scalar() or 0
            print(f"Total count: {total}")
            
            query = query.order_by(TreatmentPlan.created_at.desc())
            query = query.offset(0).limit(5)
            
            result = await db.execute(query)
            plans = list(result.unique().scalars().all())
            print(f"Plans fetched: {len(plans)}")
            
        except Exception as e:
            traceback.print_exc()

asyncio.run(test())
