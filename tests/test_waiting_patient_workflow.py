"""Waiting-patient workflow verification:
- set-waiting WAITING_PATIENT creates a follow-up task
- the follow-up is visible to the CRM staff user
- staff logs a phone call and books an appointment
- does the WAITING_PATIENT treatment resume when the patient re-engages?
"""
import pytest
from datetime import date, timedelta
from httpx import AsyncClient
from sqlalchemy import select

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.follow_up import FollowUp, FollowUpStatus
from app.models.hospital import Hospital
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.user import User


@pytest.fixture
async def seed(db_session):
    g1 = AdminGroup(name="Waiting Patient Group", description="")
    db_session.add(g1)
    await db_session.flush()
    ha = Hospital(admin_group_id=g1.id, name="Waiting Hosp A")
    db_session.add(ha)
    await db_session.flush()

    def _user(email, name, role, hospital=None, group=None):
        return User(email=email, password_hash=hash_password("TestPass123"), full_name=name,
                    role=role, hospital_id=hospital.id if hospital else None,
                    admin_group_id=group.id if group else None,
                    is_active=True, is_verified=True)

    users = {
        "HA": _user("waiting_ha@t.com", "Waiting HA", Role.HOSPITAL_ADMIN, hospital=ha, group=g1),
        "DR": _user("waiting_dr@t.com", "Waiting Dr", Role.DOCTOR, hospital=ha, group=g1),
    }
    db_session.add_all(list(users.values()))
    await db_session.commit()
    return {"g1": g1.id, "HA_ID": ha.id, **{k: v.id for k, v in users.items()}}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def create_patient_case_plan(client, headers, name, phone):
    r = await client.post("/api/v1/patients/", headers=headers, json={
        "full_name": name, "phone": phone, "gender": "MALE",
    })
    assert r.status_code == 201, f"Create patient failed: {r.text}"
    patient_id = r.json()["id"]
    r = await client.post("/api/v1/cases/", headers=headers, json={
        "patient_id": patient_id, "chief_complaint": "Needs follow-up",
    })
    assert r.status_code == 201, f"Create case failed: {r.text}"
    case_id = r.json()["id"]
    r = await client.post("/api/v1/treatment-plans/", headers=headers, json={
        "case_id": case_id, "treatment_name": name + " Tx", "cost": 1000, "total_sittings": 2,
    })
    assert r.status_code == 201, f"Create plan failed: {r.text}"
    return patient_id, case_id, r.json()["id"]


@pytest.mark.asyncio
async def test_waiting_patient_full_flow(client: AsyncClient, seed, db_session):
    ha = await login(client, "waiting_ha@t.com")
    dr = await login(client, "waiting_dr@t.com")
    patient_id, case_id, plan = await create_patient_case_plan(
        client, auth(ha), "Waiting Pat", "8200000101")

    # 1. Staff puts the treatment on hold waiting for the patient.
    r = await client.post(f"/api/v1/treatment-plans/{plan}/set-waiting",
                          headers=auth(ha),
                          params={"waiting_type": "WAITING_PATIENT"},
                          json={"reason": "Patient needs to complete antibiotic course"})
    assert r.status_code == 200, r.text
    r = await client.get(f"/api/v1/treatment-plans/{plan}", headers=auth(ha))
    assert r.json()["status"] == "WAITING_PATIENT"

    # 2. A follow-up task must have been auto-created for the staff user to see.
    fu_rows = (await db_session.execute(
        select(FollowUp).where(FollowUp.treatment_id == plan))).scalars().all()
    assert len(fu_rows) == 1, "set-waiting must create exactly one waiting-patient follow-up"
    fu = fu_rows[0]
    assert fu.status == FollowUpStatus.PENDING.value
    assert fu.follow_up_date == date.today() + timedelta(days=7)
    assert fu.case_id == case_id

    # 3. Staff user sees the follow-up in the CRM follow-up list.
    r = await client.get("/api/v1/crm/follow-ups", headers=auth(ha),
                         params={"patient_id": patient_id})
    assert r.status_code == 200, r.text
    items = r.json() if isinstance(r.json(), list) else r.json().get("data", [])
    fu_ids = [i.get("id") for i in items]
    assert str(fu.id) in fu_ids, "Waiting-patient follow-up must be visible in CRM list"

    # 4. Staff calls the patient (CALL channel logged on the follow-up).
    r = await client.post(f"/api/v1/crm/follow-ups/{fu.id}/communicate",
                          headers=auth(ha),
                          json={"channel": "CALL", "message": "Called patient to check in",
                                "notes": "Patient says feeling better"})
    assert r.status_code == 200, r.text
    fu_id = fu.id
    db_session.expire_all()
    fu = (await db_session.execute(
        select(FollowUp).where(FollowUp.id == fu_id))).scalar_one()
    assert fu.call_made_at is not None, "CALL communication must stamp call_made_at"

    # 5. Staff books the appointment directly from the follow-up.
    future = (date.today() + timedelta(days=3)).isoformat()
    r = await client.post(f"/api/v1/crm/follow-ups/{fu.id}/create-appointment",
                          headers=auth(ha),
                          json={"doctor_id": seed["DR"],
                                "appointment_date": future,
                                "appointment_time": "11:00"})
    assert r.status_code == 200, r.text
    fu_id = fu.id
    db_session.expire_all()
    fu = (await db_session.execute(
        select(FollowUp).where(FollowUp.id == fu_id))).scalar_one()
    assert fu.appointment_id is not None
    assert fu.status == FollowUpStatus.APPOINTMENT_BOOKED.value

    # 6. Correctness check: after the patient re-engages (call + appointment),
    #    the treatment must no longer be waiting on the patient.
    r = await client.get(f"/api/v1/treatment-plans/{plan}", headers=auth(ha))
    plan_status = r.json()["status"]
    assert plan_status == "IN_PROGRESS", (
        "WAITING_PATIENT treatment must resume (leave the waiting queue) once the "
        f"patient is called and an appointment is booked. Still WAITING_PATIENT. "
        f"plan_status={plan_status!r}"
    )
