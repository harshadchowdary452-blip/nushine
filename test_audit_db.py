import sys; sys.path.insert(0, ".")
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine("postgresql+asyncpg://postgres:postgres@localhost:5432/nushine")
    async with engine.begin() as conn:
        # 1. Check crm_follow_up_configs schema
        r = await conn.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='crm_follow_up_configs' ORDER BY ordinal_position"))
        print("=== crm_follow_up_configs columns ===")
        for row in r: print(f"  {row[0]}: {row[1]}")

        # 2. Check crm_configs schema
        r = await conn.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='crm_configs' ORDER BY ordinal_position"))
        print("\n=== crm_configs columns ===")
        for row in r: print(f"  {row[0]}: {row[1]}")

        # 3. Check enquiries schema
        r = await conn.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='enquiries' ORDER BY ordinal_position"))
        print("\n=== enquiries columns ===")
        for row in r: print(f"  {row[0]}: {row[1]}")

        # 4. Count enquiries
        r = await conn.execute(text("SELECT COUNT(*) FROM enquiries"))
        print(f"\n=== Total enquiries: {r.scalar()} ===")

        # 5. List recent enquiries
        r = await conn.execute(text("SELECT id, enquiry_type, description, scheduled_date, status, hospital_id, patient_id, doctor_id, case_id, treatment_type FROM enquiries ORDER BY created_at DESC LIMIT 10"))
        print("\n=== Recent 10 enquiries ===")
        for row in r:
            print(f"  type={row[1]}, desc={str(row[2])[:50]}..., scheduled={row[3]}, status={row[4]}, hospital={str(row[5])[:8] if row[5] else 'None'}, patient={str(row[6])[:8] if row[6] else 'None'}, doctor={str(row[7])[:8] if row[7] else 'None'}, case={str(row[8])[:8] if row[8] else 'None'}, treatment={row[9]}")

        # 6. Check event_log
        r = await conn.execute(text("SELECT COUNT(*) FROM event_log"))
        print(f"\n=== Total event_log entries: {r.scalar()} ===")

        # 7. List recent event_log entries
        r = await conn.execute(text("SELECT event_type, source_module, entity_type, status, processing_time_ms FROM event_log ORDER BY created_at DESC LIMIT 10"))
        print("\n=== Recent 10 events ===")
        for row in r:
            print(f"  type={row[0]}, source={row[1]}, entity={row[2]}, status={row[3]}, time={row[4]}ms")

        # 8. Check automation_rules
        r = await conn.execute(text("SELECT id, rule_name, trigger_event, is_active FROM automation_rules LIMIT 10"))
        print("\n=== Automation rules ===")
        for row in r:
            print(f"  {row[1]}: trigger={row[2]}, active={row[3]}")

        # 9. Check crm_follow_up_configs data
        r = await conn.execute(text("SELECT context_type, treatment_type_id, enabled, start_delay_days, auto_close_on_completion, skip_wellness_if_appointment FROM crm_follow_up_configs"))
        print("\n=== CRM Follow-up Configs ===")
        for row in r:
            print(f"  context={row[0]}, tt_id={str(row[1])[:8] if row[1] else 'None'}, enabled={row[2]}, delay={row[3]}, auto_close={row[4]}, skip_wellness={row[5]}")

        # 10. Check automation_rule_log
        r = await conn.execute(text("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='automation_rule_log')"))
        if r.scalar():
            r2 = await conn.execute(text("SELECT COUNT(*) FROM automation_rule_log"))
            print(f"\n=== Automation rule log entries: {r2.scalar()} ===")
        else:
            print("\n=== automation_rule_log table does NOT exist ===")

    await engine.dispose()

asyncio.run(main())
