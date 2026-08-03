"""Deterministic tests for the recurring recall scheduler pass.

Exercises `_run_recurring_recall_pass` directly (no live scheduler loop):
  * advance — an overdue PENDING occurrence is closed and its successor scheduled
  * idempotency — a chain with a newer PENDING occurrence is never double-advanced
  * heal — a chain whose latest occurrence is COMPLETED without a successor is recovered
  * fresh interval — the CASE_RECALL interval is read from the DB config (not cached)
"""
from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models.hospital import Hospital
from app.models.admin_group import AdminGroup
from app.models.patient import Patient
from app.models.case import Case, CaseStatus
from app.models.generated_enquiry import GeneratedEnquiry
from app.models.crm_follow_up_config import CrmFollowUpConfig
from app.utils.scheduler import _run_recurring_recall_pass

from tests.conftest import test_async_session_factory


def _recall_decision(*, patient_id, case_id, due_date, occurrence_number=1,
                     recurrence_interval_days=180, chain_id=None, description="Patient is due for routine dental recall"):
    from app.crm.services.event_dispatcher import Decision
    return Decision(
        action="CREATE",
        enquiry_type="RECALL",
        due_date=due_date,
        priority="LOW",
        patient_id=patient_id,
        case_id=case_id,
        trigger_event="CASE_COMPLETED",
        description=description,
        is_recurring=True,
        occurrence_number=occurrence_number,
        recurrence_interval_days=recurrence_interval_days,
        chain_id=chain_id,
    )


async def _create_first_recall(db, hospital_id, patient_id, case_id, due_date, interval_days=180):
    """Create occurrence #1 through the public executor path (like CASE_COMPLETED)."""
    from app.crm.services.enquiry_executor import get_enquiry_executor
    decision = _recall_decision(
        patient_id=patient_id, case_id=case_id, due_date=due_date,
        recurrence_interval_days=interval_days,
    )
    result = await get_enquiry_executor().execute(db, hospital_id, decision, {})
    assert result.enquiries_created == 1, result.errors
    ge = await db.get(GeneratedEnquiry, result.created_ids[0])
    await db.flush()
    return ge


async def _seed_chain(db, *, hospital_id, patient_id, case_id, chain_id,
                      occurrence_number, due_date, status="PENDING"):
    ge = GeneratedEnquiry(
        hospital_id=hospital_id,
        patient_id=patient_id,
        case_id=case_id,
        enquiry_type="RECALL",
        due_date=due_date,
        priority="LOW",
        status=status,
        notes=f"Recurring recall #{occurrence_number}",
        is_recurring=True,
        occurrence_number=occurrence_number,
        recurrence_interval_days=180,
        chain_id=chain_id,
        trigger_event="CASE_COMPLETED",
        created_by_event="CASE_COMPLETED",
    )
    db.add(ge)
    await db.flush()
    return ge


async def _seed_ctx(db):
    admin_group = AdminGroup(name=f"ag-{date.today().isoformat()}")
    db.add(admin_group)
    await db.flush()
    hospital = Hospital(admin_group_id=admin_group.id, name="Recall Test Hospital")
    db.add(hospital)
    await db.flush()
    patient = Patient(hospital_id=hospital.id, full_name="Recall Test Patient")
    db.add(patient)
    await db.flush()
    case = Case(patient_id=patient.id, chief_complaint="recall test", status=CaseStatus.COMPLETED)
    db.add(case)
    await db.flush()
    return admin_group, hospital, patient, case


async def _active_recalls(db, chain_id):
    result = await db.execute(
        select(GeneratedEnquiry).where(
            GeneratedEnquiry.chain_id == chain_id,
            GeneratedEnquiry.enquiry_type == "RECALL",
        ).order_by(GeneratedEnquiry.occurrence_number)
    )
    return result.scalars().all()


@pytest.fixture
def isolated_factory():
    yield test_async_session_factory


@pytest.mark.asyncio
async def test_advance_overdue_chain(isolated_factory):
    async with test_async_session_factory() as db:
        _, hospital, patient, case = await _seed_ctx(db)
        chain = "chain-advance"
        due = date.today() - timedelta(days=10)
        first = await _seed_chain(
            db, hospital_id=hospital.id, patient_id=patient.id, case_id=case.id,
            chain_id=chain, occurrence_number=1, due_date=due,
        )
        await db.commit()

    result = await _run_recurring_recall_pass(test_async_session_factory)
    assert result["advanced"] == 1
    assert result["healed"] == 0

    async with test_async_session_factory() as db:
        members = await _active_recalls(db, chain)
        assert len(members) == 2

        old = members[0]
        assert old.status == "COMPLETED"
        assert old.cancelled_by_event == "RECURRING_RECALL_AUTO_ADVANCED"
        assert old.cancelled_at is not None

        new = members[1]
        assert new.status == "PENDING"
        assert new.occurrence_number == 2
        assert new.due_date == due + timedelta(days=180)


@pytest.mark.asyncio
async def test_no_double_advance_when_newer_pending_exists(isolated_factory):
    async with test_async_session_factory() as db:
        _, hospital, patient, case = await _seed_ctx(db)
        chain = "chain-idem"
        await _seed_chain(
            db, hospital_id=hospital.id, patient_id=patient.id, case_id=case.id,
            chain_id=chain, occurrence_number=1,
            due_date=date.today() - timedelta(days=10),
        )
        await _seed_chain(
            db, hospital_id=hospital.id, patient_id=patient.id, case_id=case.id,
            chain_id=chain, occurrence_number=2,
            due_date=date.today() + timedelta(days=170),
        )
        await db.commit()

    result = await _run_recurring_recall_pass(test_async_session_factory)
    assert result["advanced"] == 0

    async with test_async_session_factory() as db:
        members = await _active_recalls(db, chain)
        assert len(members) == 2
        assert all(m.status == "PENDING" for m in members)


@pytest.mark.asyncio
async def test_heal_completed_chain_without_successor(isolated_factory):
    async with test_async_session_factory() as db:
        _, hospital, patient, case = await _seed_ctx(db)
        chain = "chain-heal"
        due = date.today() - timedelta(days=60)
        await _seed_chain(
            db, hospital_id=hospital.id, patient_id=patient.id, case_id=case.id,
            chain_id=chain, occurrence_number=1, due_date=due, status="COMPLETED",
        )
        await db.commit()

    result = await _run_recurring_recall_pass(test_async_session_factory)
    assert result["healed"] == 1

    async with test_async_session_factory() as db:
        members = await _active_recalls(db, chain)
        assert len(members) == 2
        assert members[1].status == "PENDING"
        assert members[1].occurrence_number == 2
        assert members[1].due_date == due + timedelta(days=180)


@pytest.mark.asyncio
async def test_interval_read_fresh_from_db(isolated_factory):
    async with test_async_session_factory() as db:
        _, hospital, patient, case = await _seed_ctx(db)
        db.add(CrmFollowUpConfig(
            hospital_id=hospital.id,
            context_type="CASE_RECALL",
            enabled=True,
            start_delay_days=60,
        ))
        chain = "chain-interval"
        due = date.today() - timedelta(days=5)
        await _seed_chain(
            db, hospital_id=hospital.id, patient_id=patient.id, case_id=case.id,
            chain_id=chain, occurrence_number=1, due_date=due,
        )
        await db.commit()

    result = await _run_recurring_recall_pass(test_async_session_factory)
    assert result["advanced"] == 1

    async with test_async_session_factory() as db:
        members = await _active_recalls(db, chain)
        new = members[1]
        assert new.recurrence_interval_days == 60
        assert new.due_date == due + timedelta(days=60)


@pytest.mark.asyncio
async def test_first_occurrence_self_chains_after_create(isolated_factory):
    """Regression: the first recurring recall must get chain_id = its own id.

    Previously `ge.chain_id = ge.id` ran BEFORE flush (ge.id was None), so every
    first occurrence was stored with chain_id = NULL and the recurring chain was
    invisible to chain-based grouping / healing.
    """
    async with test_async_session_factory() as db:
        _, hospital, patient, case = await _seed_ctx(db)
        due = date.today() + timedelta(days=180)
        occ1 = await _create_first_recall(db, hospital.id, patient.id, case.id, due)
        assert occ1.chain_id == occ1.id, "first occurrence must self-chain after create"
        await db.commit()


@pytest.mark.asyncio
async def test_recall_completed_event_schedules_correct_successor(isolated_factory):
    """Regression: completing a recurring recall must schedule the NEXT occurrence.

    The successor must:
      * reuse the SAME chain (chain_id == first occurrence's id)
      * have occurrence_number = 2
      * be due at previous_due + current interval (cycle-based, no drift)
      * still be PENDING
    This is the event path a user triggers by completing a recall in the UI.
    """
    from app.crm.services.event_dispatcher import get_central_dispatcher, publish_event
    from app.crm.services.rule_engine import get_rule_engine
    from app.crm.services.enquiry_executor import get_enquiry_executor
    from app.crm.enums import EventType, EventSource

    dispatcher = get_central_dispatcher()
    dispatcher.set_rule_engine(get_rule_engine())
    dispatcher.set_executor(get_enquiry_executor())

    async with test_async_session_factory() as db:
        _, hospital, patient, case = await _seed_ctx(db)
        db.add(CrmFollowUpConfig(
            hospital_id=hospital.id,
            context_type="CASE_RECALL",
            enabled=True,
            start_delay_days=60,
        ))
        await db.flush()

        occ1_due = date.today() + timedelta(days=10)
        occ1 = await _create_first_recall(db, hospital.id, patient.id, case.id, occ1_due, interval_days=60)
        assert occ1.chain_id == occ1.id

        # Simulate the UI status-update path: mark COMPLETED, then the RECALL_COMPLETED event fires.
        occ1.status = "COMPLETED"
        await db.flush()

        await publish_event(
            event_type=EventType.RECALL_COMPLETED,
            source_module=EventSource.RECALL,
            entity_type="RECALL",
            entity_id=occ1.id,
            hospital_id=hospital.id,
            patient_id=patient.id,
            payload={
                "enquiry_id": occ1.id,
                "patient_id": patient.id,
                "case_id": case.id,
                "occurrence_number": occ1.occurrence_number,
                "chain_id": occ1.chain_id,
            },
            db=db,
        )
        await db.commit()

        members = await _active_recalls(db, occ1.id)
        assert len(members) == 2, f"expected 2 chain members, got {len(members)}"
        new = members[1]
        assert new.status == "PENDING"
        assert new.occurrence_number == 2
        assert new.chain_id == occ1.id
        assert new.due_date == occ1_due + timedelta(days=60)
        assert new.recurrence_interval_days == 60


@pytest.mark.asyncio
async def test_recall_completed_does_not_duplicate_successor(isolated_factory):
    """The event path is idempotent: re-firing RECALL_COMPLETED must not create a 3rd member."""
    from app.crm.services.event_dispatcher import get_central_dispatcher, publish_event
    from app.crm.services.rule_engine import get_rule_engine
    from app.crm.services.enquiry_executor import get_enquiry_executor
    from app.crm.enums import EventType, EventSource

    dispatcher = get_central_dispatcher()
    dispatcher.set_rule_engine(get_rule_engine())
    dispatcher.set_executor(get_enquiry_executor())

    async with test_async_session_factory() as db:
        _, hospital, patient, case = await _seed_ctx(db)
        occ1 = await _create_first_recall(db, hospital.id, patient.id, case.id, date.today() + timedelta(days=10))
        occ1.status = "COMPLETED"
        await db.flush()

        payload = {
            "enquiry_id": occ1.id, "patient_id": patient.id, "case_id": case.id,
            "occurrence_number": occ1.occurrence_number, "chain_id": occ1.chain_id,
        }
        await publish_event(EventType.RECALL_COMPLETED, EventSource.RECALL, "RECALL",
                            occ1.id, hospital_id=hospital.id, patient_id=patient.id,
                            payload=payload, db=db)
        await db.commit()
        await publish_event(EventType.RECALL_COMPLETED, EventSource.RECALL, "RECALL",
                            occ1.id, hospital_id=hospital.id, patient_id=patient.id,
                            payload=payload, db=db)
        await db.commit()

        members = await _active_recalls(db, occ1.id)
        assert len(members) == 2, f"expected 2 chain members, got {len(members)}"
