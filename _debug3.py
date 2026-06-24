"""Check recall status values in DB"""
import sys, asyncio
sys.path.insert(0, '.')
from sqlalchemy import select
from app.database import async_session_factory
from app.models.follow_up import FollowUp

async def main():
    async with async_session_factory() as db:
        recall_types = ['6_MONTH_RECALL', '12_MONTH_RECALL', 'CUSTOM_RECALL']
        r = await db.execute(
            select(FollowUp).where(FollowUp.follow_up_type.in_(recall_types))
        )
        fus = r.scalars().all()
        print(f'Total recalls in DB: {len(fus)}')
        for fu in fus:
            print(f'  id={fu.id} type={fu.follow_up_type} status={repr(fu.status)} hid={fu.hospital_id} date={fu.follow_up_date} patient={fu.patient_id}')

asyncio.run(main())
