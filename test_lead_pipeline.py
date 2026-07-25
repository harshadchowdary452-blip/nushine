"""Diagnostic: trace the lead→enquiry pipeline end-to-end."""
import asyncio
import json
import sys
sys.path.insert(0, ".")

async def main():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from app.config import settings
    
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        # 1. Check CRM enabled
        from app.crm.services.crm_settings import get_settings_service
        svc = get_settings_service()
        settings_obj = await svc.get_settings(db, "fadd20f4-4173-423c-bfb0-a45d5435bc56")
        print(f"[1] CRM enabled: {settings_obj.enabled}")
        
        # 2. Load LEAD rules
        from app.crm.services.rule_engine import load_rules
        rules = await load_rules(db, "fadd20f4-4173-423c-bfb0-a45d5435bc56", "PATIENT_REGISTERED", "LEAD")
        print(f"[2] LEAD rules found: {len(rules)}")
        for r in rules:
            print(f"    - {r.rule_name} (id={r.id}, active={r.is_active}, hospital={r.hospital_id})")
        
        # 3. Find a real lead for this hospital
        from app.models.lead import Lead
        from sqlalchemy import select
        q_lead = select(Lead).where(Lead.hospital_id == "fadd20f4-4173-423c-bfb0-a45d5435bc56").limit(1)
        r_lead = await db.execute(q_lead)
        lead = r_lead.scalar_one_or_none()
        if not lead:
            print("[!] No leads found for this hospital")
            return
        real_lead_id = lead.id
        print(f"[3] Using real lead: id={real_lead_id}, name={lead.lead_name}")
        
        # 4. Simulate event data as it would come from event_handlers.py
        test_event_data = {
            "lead_id": real_lead_id,
            "lead_name": lead.lead_name,
            "entity_id": real_lead_id,
        }
        
        # 5. Run execute_rules directly
        from app.crm.services.rule_engine import execute_rules
        print(f"\n[4] Running execute_rules with event_data: {test_event_data}")
        try:
            result = await execute_rules(
                db, "fadd20f4-4173-423c-bfb0-a45d5435bc56",
                "PATIENT_REGISTERED", test_event_data, "LEAD"
            )
            print(f"[5] execute_rules returned: {json.dumps(result, indent=2)}")
            await db.rollback()
        except Exception as e:
            print(f"[5] ERROR: {e}")
            await db.rollback()
        
        # 6. Check generated_enquiries with lead_id NOT NULL
        q2 = select(GeneratedEnquiry).where(GeneratedEnquiry.lead_id.isnot(None))
        r2 = await db.execute(q2)
        real = r2.scalars().all()
        print(f"\n[6] Total GeneratedEnquiries with lead_id NOT NULL: {len(real)}")
        
        # 7. Check the LEAD event handler directly
        from app.crm.events import EventPayload
        from app.crm.services.event_handlers import handle_lead_created, _get_event_data
        
        event = EventPayload(
            event_type="LEAD_CREATED",
            entity_type="LEAD",
            entity_id="debug-lead-id",
            hospital_id="fadd20f4-4173-423c-bfb0-a45d5435bc56",
            payload={"lead_id": "debug-lead-id", "lead_name": "Debug"},
        )
        data = await _get_event_data(event)
        print(f"\n[7] _get_event_data result: {data}")
        print(f"    lead_id in data: {'lead_id' in data}, lead_id value: {data.get('lead_id')}")
        
        await db.rollback()
    
    await engine.dispose()

asyncio.run(main())
