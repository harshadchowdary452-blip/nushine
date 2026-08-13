"""Lab → treatment continuity tests:
- RETURNED / CANCELLED lab resumes a WAITING_LAB treatment to IN_PROGRESS (never completes it)
- re-submitting WAITING_LAB details updates the single lab case (idempotent, no duplicates)
- HOSPITAL_ADMIN manages laboratories scoped to own hospital (incl. single-hospital orgs)
- WhatsApp identical re-send is deduped within 45s
- transfer reuses an existing SCHEDULED appointment for the patient+date
"""
import pytest
from datetime import date, time
from httpx import AsyncClient
from sqlalchemy import select

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.appointment import Appointment, AppointmentStatus
from app.models.hospital import Hospital
from app.models.patient_timeline import PatientTimeline
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.treatment_plan_item import TreatmentPlanItem
from app.models.user import User


@pytest.fixture
async def seed(db_session):
    g1 = AdminGroup(name="Lab Continuity Group", description="")
    db_session.add(g1)
    await db_session.flush()
    ha = Hospital(admin_group_id=g1.id, name="Cont Hosp A")
    hb = Hospital(admin_group_id=g1.id, name="Cont Hosp B")
    db_session.add_all([ha, hb])
    await db_session.flush()

    def _user(email, name, role, hospital=None, group=None):
        return User(email=email, password_hash=hash_password("TestPass123"), full_name=name,
                    role=role, hospital_id=hospital.id if hospital else None,
                    admin_group_id=group.id if group else None,
                    is_active=True, is_verified=True)

    users = {
        "SA": _user("cont_sa@t.com", "Cont SA", Role.SUPER_ADMIN),
        "GA": _user("cont_ga@t.com", "Cont GA", Role.GROUP_ADMIN, group=g1),
        "HA": _user("cont_ha@t.com", "Cont HA", Role.HOSPITAL_ADMIN, hospital=ha, group=g1),
        "HB": _user("cont_hb@t.com", "Cont HB", Role.HOSPITAL_ADMIN, hospital=hb, group=g1),
        "DR": _user("cont_dr@t.com", "Cont Dr", Role.DOCTOR, hospital=ha, group=g1),
        "DR_B": _user("cont_dr_b@t.com", "Cont Dr B", Role.DOCTOR, hospital=hb, group=g1),
    }
    db_session.add_all(list(users.values()))
    await db_session.commit()
    return {"g1": g1.id, "HA_ID": ha.id, "HB_ID": hb.id,
            **{k: v.id for k, v in users.items()}}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def create_patient_case_plan(client, headers, name, phone, complaint="Needs crown"):
    r = await client.post("/api/v1/patients/", headers=headers, json={
        "full_name": name, "phone": phone, "gender": "MALE",
    })
    assert r.status_code == 201, f"Create patient failed: {r.text}"
    patient_id = r.json()["id"]
    r = await client.post("/api/v1/cases/", headers=headers, json={
        "patient_id": patient_id, "chief_complaint": complaint,
    })
    assert r.status_code == 201, f"Create case failed: {r.text}"
    case_id = r.json()["id"]
    r = await client.post("/api/v1/treatment-plans/", headers=headers, json={
        "case_id": case_id, "treatment_name": name + " Tx", "cost": 1000, "total_sittings": 2,
    })
    assert r.status_code == 201, f"Create plan failed: {r.text}"
    return patient_id, case_id, r.json()["id"]


async def send_to_lab(client, headers, plan_id, **body):
    r = await client.post(f"/api/v1/treatment-plans/{plan_id}/set-waiting?waiting_type=WAITING_LAB",
                          headers=headers, json=body)
    assert r.status_code == 200, f"set-waiting failed: {r.text}"
    return r


@pytest.mark.asyncio
async def test_lab_returned_resumes_waiting_treatment(client: AsyncClient, seed, db_session):
    ha = await login(client, "cont_ha@t.com")
    dr = await login(client, "cont_dr@t.com")
    _, _, plan = await create_patient_case_plan(client, auth(ha), "Resume Patient", "8100000101")

    await send_to_lab(client, auth(dr), plan, lab_name="ResumeLab", lab_order_number="PO-R1",
                      lab_sent_date="2026-07-20", lab_cost=1800)

    r = await client.get(f"/api/v1/treatment-plans/{plan}", headers=auth(dr))
    assert r.json()["status"] == "WAITING_LAB"

    r = await client.get(f"/api/v1/lab-cases/by-treatment/{plan}", headers=auth(dr))
    lab_case_id = r.json()["id"]

    # Lab comes back → treatment resumes to IN_PROGRESS (never auto-completed).
    r = await client.post(f"/api/v1/lab-cases/{lab_case_id}/status", headers=auth(dr),
                          json={"status": "RETURNED", "note": "delivered"})
    assert r.status_code == 200, r.text
    assert r.json()["lab_status"] == "RETURNED"
    assert r.json()["returned_date"] == date.today().isoformat()

    r = await client.get(f"/api/v1/treatment-plans/{plan}", headers=auth(dr))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "IN_PROGRESS", "WAITING_LAB must resume to IN_PROGRESS on RETURNED"

    # Timeline records the resume on the patient timeline.
    tl = await db_session.execute(
        select(PatientTimeline).where(PatientTimeline.patient_id == r.json()["patient_id"])
    )
    actions = [t.action for t in tl.scalars().all()]
    assert any("Treatment Resumed" in a for a in actions), actions


@pytest.mark.asyncio
async def test_cancelled_lab_resumes_waiting_treatment(client: AsyncClient, seed):
    ha = await login(client, "cont_ha@t.com")
    dr = await login(client, "cont_dr@t.com")
    _, _, plan = await create_patient_case_plan(client, auth(ha), "Cancel Patient", "8100000102")
    await send_to_lab(client, auth(dr), plan, lab_name="CancelLab", lab_order_number="PO-C1")
    r = await client.get(f"/api/v1/lab-cases/by-treatment/{plan}", headers=auth(dr))
    lab_case_id = r.json()["id"]

    r = await client.post(f"/api/v1/lab-cases/{lab_case_id}/status", headers=auth(dr),
                          json={"status": "CANCELLED", "note": "no longer needed"})
    assert r.status_code == 200, r.text
    r = await client.get(f"/api/v1/treatment-plans/{plan}", headers=auth(dr))
    assert r.json()["status"] == "IN_PROGRESS", "Cancelling the lab must also release the treatment"


@pytest.mark.asyncio
async def test_resubmit_set_waiting_updates_not_duplicates(client: AsyncClient, seed):
    ha = await login(client, "cont_ha@t.com")
    dr = await login(client, "cont_dr@t.com")
    _, _, plan = await create_patient_case_plan(client, auth(ha), "Idem Patient", "8100000103")

    await send_to_lab(client, auth(dr), plan, lab_name="IdemLab", lab_order_number="PO-100",
                      lab_cost=2000)
    r = await client.get(f"/api/v1/lab-cases/by-treatment/{plan}", headers=auth(dr))
    first = r.json()
    assert first["order_number"] == "PO-100"

    # Re-submit with updated order number and cost → 200, same lab case, no duplicate.
    await send_to_lab(client, auth(dr), plan, lab_name="IdemLab", lab_order_number="PO-200",
                      lab_cost=2500)
    r = await client.get(f"/api/v1/lab-cases/by-treatment/{plan}", headers=auth(dr))
    assert r.json()["id"] == first["id"]
    assert r.json()["order_number"] == "PO-200"
    assert r.json()["lab_cost"] == 2500.0

    r = await client.get("/api/v1/lab-cases/", headers=auth(dr))
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 1, "Only one lab case may exist per treatment"

    # from-treatment is also idempotent now (200 + same id, never a 409 duplicate).
    r = await client.post(f"/api/v1/lab-cases/from-treatment/{plan}", headers=auth(dr),
                          json={"order_number": "PO-300"})
    assert r.status_code == 200, r.text
    assert r.json()["id"] == first["id"]
    assert r.json()["order_number"] == "PO-300"
    r = await client.get("/api/v1/lab-cases/", headers=auth(dr))
    assert r.json()["total"] == 1


@pytest.mark.asyncio
async def test_hospital_admin_lab_tenancy(client: AsyncClient, seed):
    ga = await login(client, "cont_ga@t.com")
    ha = await login(client, "cont_ha@t.com")
    hb = await login(client, "cont_hb@t.com")
    dr = await login(client, "cont_dr@t.com")

    # Doctor still cannot create.
    r = await client.post("/api/v1/laboratories/", headers=auth(dr), json={"name": "Dr Lab"})
    assert r.status_code == 403, r.text

    # HOSPITAL_ADMIN (no GROUP_ADMIN present in this org) can now create, scoped to own hospital.
    r = await client.post("/api/v1/laboratories/", headers=auth(ha), json={"name": "HA Lab"})
    assert r.status_code == 201, r.text
    lab = r.json()
    assert lab["hospital_id"] == seed["HA_ID"], "HA-created lab must be bound to its hospital"
    lab_id = lab["id"]

    # HA can update/delete own lab.
    r = await client.put(f"/api/v1/laboratories/{lab_id}", headers=auth(ha), json={"name": "HA Lab Max"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "HA Lab Max"

    # Hospital B is isolated: cannot see, update, or delete HA's lab.
    r = await client.get("/api/v1/laboratories/", headers=auth(hb))
    assert r.status_code == 200
    assert r.json()["total"] == 0, "Hospital B must not see Hospital A's laboratory"
    r = await client.put(f"/api/v1/laboratories/{lab_id}", headers=auth(hb), json={"name": "Stolen"})
    assert r.status_code == 403, r.text
    r = await client.delete(f"/api/v1/laboratories/{lab_id}", headers=auth(hb))
    assert r.status_code == 403, r.text

    # Group admin and doctors of hospital A can see it.
    r = await client.get("/api/v1/laboratories/", headers=auth(ga))
    assert r.json()["total"] == 1
    r = await client.get("/api/v1/laboratories/", headers=auth(dr))
    assert r.json()["total"] == 1

    # Legacy global laboratory (no hospital) is shared with all scoped roles.
    r = await client.post("/api/v1/laboratories/", headers=auth(ga), json={"name": "Legacy Lab"})
    assert r.status_code == 201, r.text
    assert r.json()["hospital_id"] is None
    assert (await client.get("/api/v1/laboratories/", headers=auth(ha))).json()["total"] == 2
    assert (await client.get("/api/v1/laboratories/", headers=auth(hb))).json()["total"] == 1
    assert (await client.get("/api/v1/laboratories/", headers=auth(dr))).json()["total"] == 2

    # HA can delete own lab; GA can delete legacy global lab.
    r = await client.delete(f"/api/v1/laboratories/{lab_id}", headers=auth(ha))
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_whatsapp_duplicate_skipped(client: AsyncClient, seed):
    ha = await login(client, "cont_ha@t.com")
    dr = await login(client, "cont_dr@t.com")
    _, _, plan = await create_patient_case_plan(client, auth(ha), "WhatsApp Patient", "8100000104")
    await send_to_lab(client, auth(dr), plan, lab_name="WaLab", lab_order_number="PO-W1")
    r = await client.get(f"/api/v1/lab-cases/by-treatment/{plan}", headers=auth(dr))
    lab_case_id = r.json()["id"]

    payload = {"message": "PFM crown ready?", "phone": "9876501234"}
    r1 = await client.post(f"/api/v1/lab-cases/{lab_case_id}/whatsapp", headers=auth(dr), json=payload)
    assert r1.status_code == 200, r1.text
    assert r1.json().get("duplicate_skipped") is not True

    r2 = await client.post(f"/api/v1/lab-cases/{lab_case_id}/whatsapp", headers=auth(dr), json=payload)
    assert r2.status_code == 200, r2.text
    assert r2.json().get("duplicate_skipped") is True, "Identical re-send within 45s must be skipped"

    r = await client.get(f"/api/v1/lab-cases/{lab_case_id}/events", headers=auth(dr))
    whatsapp_events = [e for e in r.json() if e["event_type"] == "WHATSAPP"]
    assert len(whatsapp_events) == 1, "Only one WhatsApp event may be recorded"


@pytest.mark.asyncio
async def test_transfer_reuses_existing_appointment(client: AsyncClient, seed, db_session):
    token = await login(client, "cont_ha@t.com")
    headers = auth(token)
    dr_b = seed["DR_B"]
    patient_id, case_id, _ = await create_patient_case_plan(
        client, headers, "Reuse Patient", "8100000105", complaint="Multi-step")

    # Source treatment — single sitting so it completes at the estimated count.
    r = await client.post("/api/v1/treatment-plans/", headers=headers, json={
        "case_id": case_id, "treatment_name": "Scaling", "cost": 1000, "total_sittings": 1,
    })
    assert r.status_code == 201, r.text
    source_id = r.json()["id"]
    r = await client.post("/api/v1/treatment-sittings/", headers=headers, json={
        "treatment_plan_id": source_id, "sitting_number": 1,
        "status": "COMPLETED", "work_done": "Done",
    })
    assert r.status_code == 201, r.text

    # Target treatment in the same case, with a concern doctor via the case-report item.
    r = await client.post("/api/v1/treatment-plans/", headers=headers, json={
        "case_id": case_id, "treatment_name": "Root Canal", "cost": 5000, "total_sittings": 2,
    })
    assert r.status_code == 201, r.text
    target_id = r.json()["id"]
    item = TreatmentPlanItem(
        case_id=case_id, procedure_name="Root Canal", estimated_visits=2, estimated_cost=5000,
        sequence_order=2, assigned_doctor_id=dr_b,
    )
    db_session.add(item)
    await db_session.flush()
    target = await db_session.get(TreatmentPlan, target_id)
    target.treatment_plan_item_id = item.id
    await db_session.commit()

    # Pre-booked SCHEDULED appointment for the patient on the transfer date
    # (inserted directly: the appointments API enforces doctor availability).
    existing_appt = Appointment(
        patient_id=patient_id, doctor_id=dr_b, appointment_date=date(2026, 8, 10),
        appointment_time=time(9, 0), duration_minutes=30, end_time=time(9, 30),
        status=AppointmentStatus.SCHEDULED, notes="Pre-booked", is_active=True,
    )
    db_session.add(existing_appt)
    await db_session.commit()

    # Transfer must reuse that appointment instead of creating a duplicate.
    r = await client.post(f"/api/v1/treatment-plans/{source_id}/transfer", headers=headers, json={
        "target_plan_id": target_id,
        "appointment_date": "2026-08-10",
        "appointment_time": "11:30",
        "notes": "Continue after scaling",
    })
    assert r.status_code == 200, r.text
    assert r.json()["appointment_id"] == existing_appt.id, "Transfer must reuse the existing appointment"

    db_session.expire_all()
    appt_r = await db_session.execute(
        select(Appointment).where(Appointment.patient_id == patient_id,
                                  Appointment.appointment_date == date(2026, 8, 10),
                                  Appointment.status == AppointmentStatus.SCHEDULED,
                                  Appointment.is_active == True)
    )
    appts = appt_r.scalars().all()
    assert len(appts) == 1, "Only one SCHEDULED appointment may exist for the patient/date"
    assert appts[0].doctor_id == dr_b
    assert "Root Canal" in (appts[0].notes or ""), f"Reused appointment notes must carry the transfer details, got: {appts[0].notes!r}"
