"""Tests for extra visits (reopen a COMPLETED treatment) and treatment-to-treatment transfer."""
import pytest
from datetime import date, time
from httpx import AsyncClient
from sqlalchemy import select
from app.core.security import hash_password
from app.core.permissions import Role
from app.models.user import User
from app.models.hospital import Hospital
from app.models.admin_group import AdminGroup
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.treatment_plan_item import TreatmentPlanItem
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType


@pytest.fixture
async def seed(db_session):
    group = AdminGroup(name="Transfer Test Group", description="Transfer E2E")
    db_session.add(group)
    await db_session.flush()
    hospital = Hospital(admin_group_id=group.id, name="Transfer Test Hospital", address="Transfer Test Addr")
    db_session.add(hospital)
    await db_session.flush()
    users = {
        "SA": User(hospital_id=hospital.id, admin_group_id=group.id, email="transfer_sa@t.com",
                   password_hash=hash_password("TestPass123"), full_name="Transfer SA", role=Role.SUPER_ADMIN,
                   is_active=True, is_verified=True),
        "DR_A": User(hospital_id=hospital.id, admin_group_id=group.id, email="dr_a@t.com",
                     password_hash=hash_password("TestPass123"), full_name="Dr Alpha", role=Role.DOCTOR,
                     is_active=True, is_verified=True),
        "DR_B": User(hospital_id=hospital.id, admin_group_id=group.id, email="dr_b@t.com",
                     password_hash=hash_password("TestPass123"), full_name="Dr Beta", role=Role.DOCTOR,
                     is_active=True, is_verified=True),
    }
    db_session.add_all(list(users.values()))
    await db_session.commit()
    return {"hospital_id": hospital.id, **{k: v.id for k, v in users.items()}}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


async def create_patient_case(client, headers, name, phone, complaint):
    r = await client.post("/api/v1/patients/", headers=headers, json={
        "full_name": name, "phone": phone, "gender": "MALE",
    })
    assert r.status_code == 201, f"Create patient failed: {r.text}"
    patient_id = r.json()["id"]
    r = await client.post("/api/v1/cases/", headers=headers, json={
        "patient_id": patient_id, "chief_complaint": complaint,
    })
    assert r.status_code == 201, f"Create case failed: {r.text}"
    return patient_id, r.json()["id"]


async def create_plan(client, headers, case_id, name, total_sittings, cost=1000):
    r = await client.post("/api/v1/treatment-plans/", headers=headers, json={
        "case_id": case_id, "treatment_name": name, "cost": cost, "total_sittings": total_sittings,
    })
    assert r.status_code == 201, f"Create plan failed: {r.text}"
    return r.json()["id"]


async def complete_sitting(client, headers, plan_id, sitting_number, work_done):
    r = await client.post("/api/v1/treatment-sittings/", headers=headers, json={
        "treatment_plan_id": plan_id, "sitting_number": sitting_number,
        "status": "COMPLETED", "work_done": work_done,
    })
    assert r.status_code == 201, f"Create sitting {sitting_number} failed: {r.text}"


@pytest.mark.asyncio
async def test_extra_visit_reopens_completed_treatment(client: AsyncClient, seed):
    token = await login(client, "transfer_sa@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    _, case_id = await create_patient_case(client, headers, "Extra Visit Patient", "8000000101", "Needs polishing")
    plan_id = await create_plan(client, headers, case_id, "Scaling", total_sittings=2)

    await complete_sitting(client, headers, plan_id, 1, "Upper arch scaling")
    await complete_sitting(client, headers, plan_id, 2, "Lower arch scaling")

    r = await client.get(f"/api/v1/treatment-plans/{plan_id}", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "COMPLETED", "Plan should be COMPLETED at estimated visit count"
    assert r.json()["remaining_sittings"] == 0
    assert r.json()["completed_sittings"] == 2

    # ── Add an extra visit ──
    r = await client.post(f"/api/v1/treatment-plans/{plan_id}/extra-visit", headers=headers,
                          json={"reason": "Additional polishing session required"})
    assert r.status_code == 200, f"Extra visit failed: {r.text}"
    data = r.json()
    assert data["status"] == "IN_PROGRESS", f"Plan should reopen to IN_PROGRESS, got {data['status']}"
    assert data["total_sittings"] == 3, "Estimated visits should increment by 1"
    assert data["remaining_sittings"] == 1
    assert data["completed_sittings"] == 2
    assert data["notes"] and "Extra visit added" in data["notes"]

    # Case should be back to IN_PROGRESS
    r = await client.get(f"/api/v1/cases/{case_id}", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "IN_PROGRESS", "Case should be reopened to IN_PROGRESS"

    # ── Complete the extra (3rd) visit → plan completes again, now at 3/3 ──
    await complete_sitting(client, headers, plan_id, 3, "Polishing")
    r = await client.get(f"/api/v1/treatment-plans/{plan_id}", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "COMPLETED"
    assert r.json()["total_sittings"] == 3
    assert r.json()["completed_sittings"] == 3
    assert r.json()["remaining_sittings"] == 0


@pytest.mark.asyncio
async def test_transfer_completed_treatment_activates_target_and_schedules_appointment(client: AsyncClient, seed, db_session):
    token = await login(client, "transfer_sa@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    dr_a = seed["DR_A"]
    dr_b = seed["DR_B"]
    _, case_id = await create_patient_case(client, headers, "Transfer Patient", "8000000102", "Multi-step treatment")

    # Source treatment — completed at its estimated count.
    source_id = await create_plan(client, headers, case_id, "Scaling", total_sittings=1)
    await complete_sitting(client, headers, source_id, 1, "Scaling done")

    # Target treatment — assigned to its concern doctor via the case-report item.
    target_id = await create_plan(client, headers, case_id, "Root Canal", total_sittings=2)
    item = TreatmentPlanItem(
        case_id=case_id, procedure_name="Root Canal", estimated_visits=2, estimated_cost=5000,
        sequence_order=2, assigned_doctor_id=dr_b,
    )
    db_session.add(item)
    await db_session.flush()
    target = await db_session.get(TreatmentPlan, target_id)
    target.treatment_plan_item_id = item.id
    await db_session.commit()

    # ── Transfer: source (COMPLETED) → target, with appointment for the concern doctor ──
    r = await client.post(f"/api/v1/treatment-plans/{source_id}/transfer", headers=headers, json={
        "target_plan_id": target_id,
        "appointment_date": "2026-08-10",
        "appointment_time": "11:30",
        "notes": "Continue after scaling",
    })
    assert r.status_code == 200, f"Transfer failed: {r.text}"
    data = r.json()
    assert data["source_plan_id"] == source_id
    assert data["target_plan"]["id"] == target_id
    assert data["target_plan"]["status"] == "IN_PROGRESS", "Target treatment should be activated"
    assert data["concern_doctor_id"] == dr_b
    assert data["concern_doctor_name"] == "Dr Beta"
    assert data["appointment_id"], "Transfer should auto-create an appointment"
    assert data["appointment_date"] == "2026-08-10"
    assert data["appointment_time"] == "11:30"

    # ── Verify the auto-created appointment in the DB ──
    appt_r = await db_session.execute(
        select(Appointment).where(Appointment.id == data["appointment_id"])
    )
    appt = appt_r.scalar_one_or_none()
    assert appt is not None
    assert appt.doctor_id == dr_b, "Appointment should be booked with the concern doctor"
    assert appt.appointment_date == date(2026, 8, 10)
    assert appt.appointment_time == time(11, 30)
    assert appt.status == AppointmentStatus.SCHEDULED
    assert appt.appointment_type == AppointmentType.TREATMENT

    # ── Guards ──
    # Transfer from a non-completed treatment is rejected.
    r = await client.post(f"/api/v1/treatment-plans/{target_id}/transfer", headers=headers, json={
        "target_plan_id": source_id,
    })
    assert r.status_code == 400
    assert "completed" in r.json()["detail"].lower()

    # Target cannot be the source itself.
    r = await client.post(f"/api/v1/treatment-plans/{source_id}/transfer", headers=headers, json={
        "target_plan_id": source_id,
    })
    assert r.status_code == 400

    # Cross-case transfer is rejected.
    _, other_case_id = await create_patient_case(client, headers, "Other Patient", "8000000103", "Other complaint")
    other_plan = await create_plan(client, headers, other_case_id, "Whitening", total_sittings=1)
    r = await client.post(f"/api/v1/treatment-plans/{source_id}/transfer", headers=headers, json={
        "target_plan_id": other_plan,
    })
    assert r.status_code == 400
    assert "same case" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_transfer_without_appointment_still_activates_target(client: AsyncClient, seed, db_session):
    token = await login(client, "transfer_sa@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    dr_b = seed["DR_B"]
    _, case_id = await create_patient_case(client, headers, "Transfer No Appt", "8000000104", "Needs next step")

    source_id = await create_plan(client, headers, case_id, "Scaling", total_sittings=1)
    await complete_sitting(client, headers, source_id, 1, "Scaling done")

    target_id = await create_plan(client, headers, case_id, "Root Canal", total_sittings=2)
    target = await db_session.get(TreatmentPlan, target_id)
    target.assigned_doctor_id = dr_b
    await db_session.commit()

    r = await client.post(f"/api/v1/treatment-plans/{source_id}/transfer", headers=headers, json={
        "target_plan_id": target_id,
    })
    assert r.status_code == 200, f"Transfer failed: {r.text}"
    data = r.json()
    assert data["target_plan"]["status"] == "IN_PROGRESS"
    assert data["appointment_id"] is None
    assert data["concern_doctor_id"] == dr_b

    r = await client.get(f"/api/v1/treatment-plans/{target_id}", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "IN_PROGRESS"
    assert r.json()["started_at"] is not None
