"""Check CRM database state directly"""
import sys, asyncio
sys.path.insert(0, '.')
from sqlalchemy import select
from app.database import async_session_factory
from app.models.treatment_follow_up_rule import TreatmentFollowUpRule
from app.models.follow_up import FollowUp

async def main():
    async with async_session_factory() as db:
        # Rules
        r = await db.execute(select(TreatmentFollowUpRule))
        rules = r.scalars().all()
        print(f'Rules: {len(rules)}')
        for rule in rules:
            print(f'  id={rule.id} name={rule.treatment_name} hid={rule.hospital_id} active={rule.is_active}')
            print(f'    1d={rule.follow_up_1_day} 7d={rule.follow_up_7_day} 6m={rule.recall_6_month} 12m={rule.recall_12_month}')

        # Follow-ups / Recalls
        r = await db.execute(select(FollowUp).order_by(FollowUp.follow_up_type, FollowUp.follow_up_date))
        fus = r.scalars().all()
        print(f'\nTotal FollowUps: {len(fus)}')
        by_type = {}
        for fu in fus:
            by_type[fu.follow_up_type] = by_type.get(fu.follow_up_type, 0) + 1
        print('By type:', by_type)

        # Show all recalls (6M, 12M, CUSTOM)
        recall_types = ['6_MONTH_RECALL', '12_MONTH_RECALL', 'CUSTOM_RECALL']
        recalls = [fu for fu in fus if fu.follow_up_type in recall_types]
        print(f'\nRecalls ({len(recalls)}):')
        for fu in recalls:
            print(f'  id={fu.id} type={fu.follow_up_type} status={fu.status} treatment={fu.treatment_name} hid={fu.hospital_id} date={fu.follow_up_date}')

asyncio.run(main())
