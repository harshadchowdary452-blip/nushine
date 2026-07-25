"""Diagnostic 2: simulate the exact API flow — create lead in session, flush, dispatch event, check."""
import asyncio
import sys
sys.path.insert(0, ".")

async def main():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from app.config import settings

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        HOSPITAL_ID = "fadd20f4-4173-423c-bfb0-a45d5435bc56"

        # Step 1: Create a real lead in the session (same as LeadService.create)
        from app.models.lead import Lead
        lead = Lead(
            lead_name="Pipeline Debug Lead 2",
            mobile="9999000101",
            source="WEBSITE",
            status="NEW",
            hospital_id=HOSPITAL_ID,
        )
        db.add(lead)
        await db.flush()
        print(f"[1] Lead created: id={lead.id}, hospital_id={lead.hospital_id}")

        # Step 2: Create EventPayload EXACTLY as leads.py does
        from app.crm.events import EventPayload, get_publisher, get_dispatcher
        from app.crm.enums import EventType, EventSource
        
        event = EventPayload(
            event_type=str(EventType.LEAD_CREATED),
            source_module=str(EventSource.LEAD),
            entity_type="LEAD",
            entity_id=lead.id,
            hospital_id=getattr(lead, 'hospital_id', None),
            payload={"lead_id": lead.id, "lead_name": getattr(lead, 'lead_name', None)},
        )
        print(f"[2] EventPayload: event_type={event.event_type}, hospital_id={event.hospital_id}")
        print(f"    payload={event.payload}")

        # Step 3: Check if dispatcher has handlers
        dispatcher = get_dispatcher()
        handlers = dispatcher._handlers.get(event.event_type, [])
        print(f"[3] Handlers for '{event.event_type}': {len(handlers)}")
        for h in handlers:
            print(f"    - {h.__name__}")

        # Step 4: Manually call handle_lead_created
        from app.crm.services.event_handlers import handle_lead_created
        print(f"\n[4] Calling handle_lead_created directly...")
        try:
            await handle_lead_created(event, db=db)
            print("[4] handle_lead_created completed successfully")
        except Exception as e:
            print(f"[4] ERROR in handle_lead_created: {type(e).__name__}: {e}")

        # Step 5: Check generated_enquiries
        from sqlalchemy import select
        from app.models.generated_enquiry import GeneratedEnquiry
        q = select(GeneratedEnquiry).where(GeneratedEnquiry.lead_id == lead.id)
        r = await db.execute(q)
        enquiries = r.scalars().all()
        print(f"\n[5] GeneratedEnquiries for lead {lead.id}: {len(enquiries)}")
        for e in enquiries:
            print(f"    - id={e.id}, rule={e.crm_rule_id}, status={e.status}, number={e.enquiry_number}")

        # Step 6: Now try the full dispatch path
        print(f"\n[6] Testing full publisher→dispatcher path...")
        lead2 = Lead(
            lead_name="Pipeline Debug Lead 3",
            mobile="9999000102",
            source="WEBSITE",
            status="NEW",
            hospital_id=HOSPITAL_ID,
        )
        db.add(lead2)
        await db.flush()
        print(f"    Lead2 created: id={lead2.id}")
        
        try:
            pub = get_publisher()
            result_event = await pub.publish(
                event_type=EventType.LEAD_CREATED,
                source_module=EventSource.LEAD,
                entity_type="LEAD",
                entity_id=lead2.id,
                hospital_id=getattr(lead2, 'hospital_id', None),
                payload={"lead_id": lead2.id, "lead_name": getattr(lead2, 'lead_name', None)},
                db=db,
            )
            print(f"    Event published: {result_event.event_type}")
        except Exception as e:
            print(f"    ERROR publishing: {type(e).__name__}: {e}")

        # Check enquiries for lead2
        q2 = select(GeneratedEnquiry).where(GeneratedEnquiry.lead_id == lead2.id)
        r2 = await db.execute(q2)
        enquiries2 = r2.scalars().all()
        print(f"    GeneratedEnquiries for lead2 {lead2.id}: {len(enquiries2)}")
        for e in enquiries2:
            print(f"      - id={e.id}, rule={e.crm_rule_id}, status={e.status}")

        await db.rollback()
        print("\n[OK] Rolled back all changes")

    await engine.dispose()

asyncio.run(main())
