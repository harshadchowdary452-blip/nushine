"""Tests for the Doctor Performance & Clinical Productivity analytics module.

Covers role-based scoping (SUPER_ADMIN / GROUP_ADMIN / HOSPITAL_ADMIN / DOCTOR),
the period-scoped aggregations, and the per-doctor detail endpoint.
"""
import pytest
from datetime import date, datetime, time, timezone

from httpx import AsyncClient

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.appointment import Appointment, AppointmentStatus
from app.models.billing import Billing, PaymentStatus
from app.models.case import Case, CaseStatus
from app.models.feedback import PatientFeedback
from app.models.follow_up import FollowUp
from app.models.generated_enquiry import GeneratedEnquiry
from app.models.hospital import Hospital
from app.models.patient import Patient
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.treatment_sitting import TreatmentSitting, TreatmentSittingStatus
from app.models.user import User

PERIOD = "period=custom&start_date=2026-07-01&end_date=2026-07-31"


def _dt(y, m, d):
    return datetime(y, m, d, tzinfo=timezone.utc)


@pytest.fixture
async def seed(db_session):
    group = AdminGroup(name="Perf Group", description="Perf Test")
    db_session.add(group)
    await db_session.flush()
    ha = Hospital(admin_group_id=group.id, name="Perf Hosp A", address="Addr A")
    hb = Hospital(admin_group_id=group.id, name="Perf Hosp B", address="Addr B")
    hc = Hospital(admin_group_id=group.id, name="Perf Hosp C (no doctors)", address="Addr C")
    db_session.add_all([ha, hb, hc])
    await db_session.flush()
    users = {
        "SA": User(email="perf_sa@t.com", password_hash=hash_password("TestPass123"),
                   full_name="Perf SA", role=Role.SUPER_ADMIN, is_active=True, is_verified=True),
        "GA": User(email="perf_ga@t.com", password_hash=hash_password("TestPass123"),
                   full_name="Perf GA", role=Role.GROUP_ADMIN, admin_group_id=group.id,
                   is_active=True, is_verified=True),
        "HA": User(email="perf_ha@t.com", password_hash=hash_password("TestPass123"),
                   full_name="Perf HA", role=Role.HOSPITAL_ADMIN, hospital_id=ha.id,
                   admin_group_id=group.id, is_active=True, is_verified=True),
        "HC": User(email="perf_hc@t.com", password_hash=hash_password("TestPass123"),
                   full_name="Perf HC", role=Role.HOSPITAL_ADMIN, hospital_id=hc.id,
                   admin_group_id=group.id, is_active=True, is_verified=True),
        # A hospital admin of a doctorless hospital who is NOT part of the group.
        "HD": User(email="perf_hd@t.com", password_hash=hash_password("TestPass123"),
                   full_name="Perf HD", role=Role.HOSPITAL_ADMIN, hospital_id=hc.id,
                   is_active=True, is_verified=True),
        "DR1": User(email="perf_dr1@t.com", password_hash=hash_password("TestPass123"),
                    full_name="Dr One", role=Role.DOCTOR, hospital_id=ha.id,
                    admin_group_id=group.id, qualification="BDS", specialization="Orthodontics",
                    is_active=True, is_verified=True),
        "DR2": User(email="perf_dr2@t.com", password_hash=hash_password("TestPass123"),
                    full_name="Dr Two", role=Role.DOCTOR, hospital_id=hb.id,
                    admin_group_id=group.id, qualification="MDS", specialization="Endodontics",
                    is_active=True, is_verified=True),
    }
    db_session.add_all(list(users.values()))
    await db_session.commit()
    return {"group_id": group.id, "HA_ID": ha.id, "HB_ID": hb.id, "HC_ID": hc.id, **{k: v.id for k, v in users.items()}}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


async def add_appt(db_session, doctor_id, patient_id, appt_date, status):
    appt = Appointment(
        patient_id=patient_id, doctor_id=doctor_id,
        appointment_date=appt_date, appointment_time=time(10, 0), end_time=time(10, 30),
        duration_minutes=30, status=AppointmentStatus(status),
    )
    db_session.add(appt)
    await db_session.flush()
    return appt


async def add_patient(db_session, hospital_id, doctor_id, name):
    p = Patient(hospital_id=hospital_id, doctor_id=doctor_id, full_name=name)
    db_session.add(p)
    await db_session.flush()
    return p


async def add_case(db_session, patient_id, doctor_id, created_dt, status="IN_PROGRESS", completion_dt=None):
    c = Case(patient_id=patient_id, doctor_id=doctor_id, chief_complaint="Pain",
             status=CaseStatus(status), created_at=created_dt, completion_date=completion_dt)
    db_session.add(c)
    await db_session.flush()
    return c


async def add_plan(db_session, case_id, doctor_id, name, created_dt, status="IN_PROGRESS",
                   completed_dt=None, cost=1000):
    tp = TreatmentPlan(case_id=case_id, treatment_name=name, cost=cost,
                       assigned_doctor_id=doctor_id, status=TreatmentPlanStatus(status),
                       created_at=created_dt, completed_at=completed_dt)
    db_session.add(tp)
    await db_session.flush()
    return tp


async def add_sitting(db_session, plan_id, doctor_id, sitting_date, number=1, status="COMPLETED"):
    s = TreatmentSitting(treatment_plan_id=plan_id, sitting_number=number, sitting_date=sitting_date,
                         doctor_id=doctor_id, status=TreatmentSittingStatus(status))
    db_session.add(s)
    await db_session.flush()
    return s


async def add_billing(db_session, case_id, paid, updated_dt):
    b = Billing(case_id=case_id, total_amount=paid, paid_amount=paid, pending_amount=0,
                payment_status=PaymentStatus.PAID, created_at=updated_dt, updated_at=updated_dt)
    db_session.add(b)
    await db_session.flush()
    return b


async def add_followup(db_session, patient_id, doctor_id, hospital_id, created_dt, status="COMPLETED"):
    fu = FollowUp(patient_id=patient_id, doctor_id=doctor_id, hospital_id=hospital_id,
                  follow_up_date=date(2026, 7, 20), status=status, created_at=created_dt)
    db_session.add(fu)
    await db_session.flush()
    return fu


async def add_feedback(db_session, patient_id, hospital_id, rating, fb_date):
    enq = GeneratedEnquiry(hospital_id=hospital_id, patient_id=patient_id,
                           trigger_event="PATIENT_SATISFACTION",
                           enquiry_type="PATIENT_SATISFACTION", due_date=date(2026, 7, 25))
    db_session.add(enq)
    await db_session.flush()
    fb = PatientFeedback(enquiry_id=enq.id, hospital_id=hospital_id, patient_id=patient_id,
                         doctor_rating=rating, feedback_date=fb_date)
    db_session.add(fb)
    await db_session.flush()
    return fb


async def seed_clinical(db_session, seed):
    """Deterministic activity for DR1 (hospital A) and a small amount for DR2 (hospital B)."""
    # ── DR1 ──
    p1 = await add_patient(db_session, seed["HA_ID"], seed["DR1"], "Perf Patient 1")
    p2 = await add_patient(db_session, seed["HA_ID"], seed["DR1"], "Perf Patient 2")
    p3 = await add_patient(db_session, seed["HA_ID"], seed["DR1"], "Perf Patient 3")

    # P1: prior visit + two completed visits in period -> returning
    await add_appt(db_session, seed["DR1"], p1.id, date(2026, 6, 1), "COMPLETED")
    await add_appt(db_session, seed["DR1"], p1.id, date(2026, 7, 10), "COMPLETED")
    await add_appt(db_session, seed["DR1"], p1.id, date(2026, 7, 12), "COMPLETED")
    # P2: new, completed in period
    await add_appt(db_session, seed["DR1"], p2.id, date(2026, 7, 15), "COMPLETED")
    # P3: new, cancelled in period
    await add_appt(db_session, seed["DR1"], p3.id, date(2026, 7, 16), "CANCELLED")

    c1 = await add_case(db_session, p1.id, seed["DR1"], _dt(2026, 7, 5), "COMPLETED", _dt(2026, 7, 20))
    c2 = await add_case(db_session, p2.id, seed["DR1"], _dt(2026, 7, 6), "IN_PROGRESS")

    tp1 = await add_plan(db_session, c1.id, seed["DR1"], "Scaling", _dt(2026, 7, 6),
                         "COMPLETED", _dt(2026, 7, 20))
    tp2 = await add_plan(db_session, c2.id, seed["DR1"], "Root Canal", _dt(2026, 7, 7), "IN_PROGRESS")

    await add_sitting(db_session, tp1.id, seed["DR1"], date(2026, 7, 12))
    await add_sitting(db_session, tp2.id, seed["DR1"], date(2026, 7, 18))

    await add_billing(db_session, c1.id, 1000, _dt(2026, 7, 15))
    await add_billing(db_session, c2.id, 500, _dt(2026, 7, 16))

    await add_followup(db_session, p1.id, seed["DR1"], seed["HA_ID"], _dt(2026, 7, 8), "COMPLETED")
    await add_followup(db_session, p2.id, seed["DR1"], seed["HA_ID"], _dt(2026, 7, 9), "LOST")

    await add_feedback(db_session, p1.id, seed["HA_ID"], 5, _dt(2026, 7, 11))
    await add_feedback(db_session, p2.id, seed["HA_ID"], 3, _dt(2026, 7, 16))

    # ── DR2 (hospital B) ──
    p4 = await add_patient(db_session, seed["HB_ID"], seed["DR2"], "Perf Patient 4")
    await add_appt(db_session, seed["DR2"], p4.id, date(2026, 7, 10), "COMPLETED")
    c3 = await add_case(db_session, p4.id, seed["DR2"], _dt(2026, 7, 5), "COMPLETED", _dt(2026, 7, 21))
    await add_billing(db_session, c3.id, 200, _dt(2026, 7, 17))

    await db_session.commit()


async def fetch_overview(client, token, query=""):
    r = await client.get(f"/api/v1/doctor-performance?{query or PERIOD}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, f"Overview failed: {r.text}"
    return r.json()


@pytest.mark.asyncio
async def test_requires_authentication(client):
    r = await client.get("/api/v1/doctor-performance")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_super_admin_sees_all_doctors(client: AsyncClient, seed, db_session):
    await seed_clinical(db_session, seed)
    token = await login(client, "perf_sa@t.com")
    data = await fetch_overview(client, token)

    assert data["summary"]["doctors"] == 2
    by_id = {d["id"]: d for d in data["doctors"]}
    assert set(by_id.keys()) == {seed["DR1"], seed["DR2"]}
    assert by_id[seed["DR1"]]["revenue"] == 1500.0
    assert by_id[seed["DR2"]]["revenue"] == 200.0

    s = data["summary"]
    assert s["patients_seen"] == 4
    assert s["returning_patients"] == 1
    assert s["new_patients"] == 3
    assert s["revenue"] == 1700.0
    assert s["appointments_completed"] == 4


@pytest.mark.asyncio
async def test_group_admin_sees_both_hospitals(client: AsyncClient, seed, db_session):
    await seed_clinical(db_session, seed)
    token = await login(client, "perf_ga@t.com")
    data = await fetch_overview(client, token)
    assert data["summary"]["doctors"] == 2
    assert data["summary"]["revenue"] == 1700.0


@pytest.mark.asyncio
async def test_hospital_admin_sees_group_scope(client: AsyncClient, seed, db_session):
    await seed_clinical(db_session, seed)
    token = await login(client, "perf_ha@t.com")
    data = await fetch_overview(client, token)
    # HOSPITAL_ADMINs who belong to an admin group see every doctor in the group
    # (multi-hospital group management), but each doctor's metrics are scoped to
    # the admin's OWN hospital only.
    assert data["summary"]["doctors"] == 2
    by_id = {d["id"]: d for d in data["doctors"]}
    assert set(by_id.keys()) == {seed["DR1"], seed["DR2"]}
    assert by_id[seed["DR1"]]["hospital_id"] == seed["HA_ID"]
    # DR1 works only at hospital A (the admin's hospital) -> full metrics.
    assert by_id[seed["DR1"]]["revenue"] == 1500.0
    # DR2 works only at hospital B -> nothing is attributable to hospital A.
    assert by_id[seed["DR2"]]["revenue"] == 0.0
    assert data["summary"]["revenue"] == 1500.0


@pytest.mark.asyncio
async def test_hospital_admin_with_no_doctors_returns_empty_payload(client: AsyncClient, seed):
    token = await login(client, "perf_hd@t.com")
    r = await client.get(
        "/api/v1/doctor-performance",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["summary"]["doctors"] == 0
    assert data["doctors"] == []
    assert data["previous"] == {}
    assert data["deltas"] == {}
    assert data["summary"]["revenue"] == 0.0


@pytest.mark.asyncio
async def test_doctor_sees_only_self(client: AsyncClient, seed, db_session):
    await seed_clinical(db_session, seed)
    t1 = await login(client, "perf_dr1@t.com")
    d1 = await fetch_overview(client, t1)
    assert d1["summary"]["doctors"] == 1
    assert d1["doctors"][0]["id"] == seed["DR1"]

    t2 = await login(client, "perf_dr2@t.com")
    d2 = await fetch_overview(client, t2)
    assert d2["summary"]["doctors"] == 1
    assert d2["doctors"][0]["id"] == seed["DR2"]


@pytest.mark.asyncio
async def test_hospital_context_denied_outside_scope(client: AsyncClient, seed, db_session):
    await seed_clinical(db_session, seed)
    token = await login(client, "perf_ha@t.com")
    r = await client.get(
        "/api/v1/doctor-performance",
        headers={"Authorization": f"Bearer {token}", "X-Hospital-ID": seed["HB_ID"]},
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "HOSPITAL_CONTEXT_DENIED"

    # Own hospital context is accepted; per-hospital activation means only
    # doctors with an active membership in that hospital are in scope. DR1
    # works at hospital A; DR2 works only at hospital B (no membership at A).
    r = await client.get(
        "/api/v1/doctor-performance",
        headers={"Authorization": f"Bearer {token}", "X-Hospital-ID": seed["HA_ID"]},
    )
    assert r.status_code == 200
    assert r.json()["summary"]["doctors"] == 1
    assert {d["id"] for d in r.json()["doctors"]} == {seed["DR1"]}


@pytest.mark.asyncio
async def test_dr1_aggregated_kpis(client: AsyncClient, seed, db_session):
    await seed_clinical(db_session, seed)
    token = await login(client, "perf_ha@t.com")
    data = await fetch_overview(client, token)
    dr1 = data["doctors"][0]

    assert dr1["patients_seen"] == 3
    assert dr1["new_patients"] == 2
    assert dr1["returning_patients"] == 1
    assert dr1["appointments_total"] == 4
    assert dr1["appointments_completed"] == 3
    assert dr1["appointments_cancelled"] == 1
    assert dr1["appointments_rescheduled"] == 0
    assert dr1["cases_created"] == 2
    assert dr1["cases_completed"] == 1
    assert dr1["active_cases"] == 1
    assert dr1["treatment_plans_created"] == 2
    assert dr1["treatments_completed"] == 1
    assert dr1["treatments_active"] == 1
    assert dr1["sittings_completed"] == 2
    assert dr1["revenue"] == 1500.0
    assert dr1["avg_revenue_per_patient"] == 500.0
    assert dr1["avg_revenue_per_appointment"] == 500.0
    assert dr1["case_completion_rate"] == 50.0
    assert dr1["treatment_completion_rate"] == 50.0
    assert dr1["treatment_acceptance_rate"] == 100.0
    assert dr1["attendance_rate"] == 75.0
    assert dr1["retention_rate"] == 33.3
    assert dr1["recall_success_rate"] == 50.0
    assert dr1["avg_rating"] == 4.0
    assert dr1["designation"] == "BDS"
    assert dr1["department"] == "Orthodontics"
    assert dr1["hospital_name"] == "Perf Hosp A"

    s = data["summary"]
    assert s["doctors"] == 2
    assert s["revenue"] == 1500.0
    assert s["patients_seen"] == 3
    assert s["attendance_rate"] == 75.0
    assert s["avg_rating"] == 4.0

    # Period-over-period deltas vs the previous window (2026-06-01..2026-07-01),
    # still scoped to the admin's own hospital (A).
    assert data["previous"]["appointments_completed"] == 1
    assert data["previous"]["revenue"] == 0.0
    assert data["deltas"]["appointments_pct"] == 200.0
    assert data["deltas"]["revenue_pct"] == 100.0


@pytest.mark.asyncio
async def test_detail_endpoint_scoping_and_payload(client: AsyncClient, seed, db_session):
    await seed_clinical(db_session, seed)

    ha = await login(client, "perf_ha@t.com")
    r = await client.get(f"/api/v1/doctor-performance/{seed['DR1']}?{PERIOD}", headers={"Authorization": f"Bearer {ha}"})
    assert r.status_code == 200
    detail = r.json()
    assert detail["name"] == "Dr One"
    assert detail["qualification"] == "BDS"
    assert detail["hospital_name"] == "Perf Hosp A"
    assert detail["metrics"]["revenue"] == 1500.0
    assert detail["metrics"]["patients_seen"] == 3
    assert detail["summary"]["patients_seen"] == 3
    assert len(detail["revenue_trend"]) >= 1
    assert any(t["month"] == "2026-07" for t in detail["revenue_trend"])
    assert any(t["month"] == "2026-07" and t["n"] == 4 for t in detail["appointment_trend"])
    assert len(detail["recent_appointments"]) == 5
    assert detail["recent_appointments"][0]["patient_name"] == "Perf Patient 3"

    # HOSPITAL_ADMIN may open any doctor in the group (multi-hospital scope).
    r = await client.get(f"/api/v1/doctor-performance/{seed['DR2']}", headers={"Authorization": f"Bearer {ha}"})
    assert r.status_code == 200
    assert r.json()["name"] == "Dr Two"

    # DOCTOR may open themselves but not a colleague.
    dr1 = await login(client, "perf_dr1@t.com")
    r = await client.get(f"/api/v1/doctor-performance/{seed['DR1']}", headers={"Authorization": f"Bearer {dr1}"})
    assert r.status_code == 200
    r = await client.get(f"/api/v1/doctor-performance/{seed['DR2']}", headers={"Authorization": f"Bearer {dr1}"})
    assert r.status_code == 403

    # GROUP_ADMIN may open any doctor in the group.
    ga = await login(client, "perf_ga@t.com")
    r = await client.get(f"/api/v1/doctor-performance/{seed['DR2']}", headers={"Authorization": f"Bearer {ga}"})
    assert r.status_code == 200
    assert r.json()["name"] == "Dr Two"

    # Unknown doctor -> 404.
    r = await client.get("/api/v1/doctor-performance/does-not-exist", headers={"Authorization": f"Bearer {ha}"})
    assert r.status_code == 404
