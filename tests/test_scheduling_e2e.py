"""E2E tests for the Unified Smart Appointment Scheduling Engine.

Tests: procedure-aware duration, slot resolution, reschedule validation,
consecutive slot reservation, and the procedure-durations endpoint.
"""
import pytest
from httpx import AsyncClient
from datetime import date, time, timedelta
from app.core.security import hash_password
from app.core.permissions import Role
from app.models.user import User
from app.models.hospital import Hospital
from app.models.admin_group import AdminGroup
from app.models.patient import Patient
from app.models.doctor_working_hour import DoctorWorkingHour, WEEKDAYS


@pytest.fixture
async def seed(db_session):
    group = AdminGroup(name="Sched Group", description="Test")
    db_session.add(group)
    await db_session.flush()
    hospital = Hospital(admin_group_id=group.id, name="Sched Hospital", address="Test")
    db_session.add(hospital)
    await db_session.flush()

    sa = User(
        hospital_id=hospital.id, admin_group_id=group.id, email="sa_sched@t.com",
        password_hash=hash_password("TestPass123"), full_name="SA Sched",
        role=Role.SUPER_ADMIN, is_active=True, is_verified=True,
    )
    dr = User(
        hospital_id=hospital.id, admin_group_id=group.id, email="dr_sched@t.com",
        password_hash=hash_password("TestPass123"), full_name="Dr Sched",
        role=Role.DOCTOR, is_active=True, is_verified=True,
    )
    db_session.add_all([sa, dr])
    await db_session.flush()

    patient = Patient(
        hospital_id=hospital.id, full_name="Sched Patient",
        phone="9000000001", gender="MALE", email="spat@t.com",
        op_no="OP-SP001",
    )
    db_session.add(patient)
    await db_session.flush()

    for day in range(5):
        wh = DoctorWorkingHour(
            doctor_id=dr.id, hospital_id=hospital.id,
            day_of_week=day, start_time=time(9, 0), end_time=time(18, 0),
            lunch_start=time(13, 0), lunch_end=time(14, 0), is_available=True,
        )
        db_session.add(wh)
    await db_session.flush()
    await db_session.commit()

    return {
        "hospital_id": hospital.id, "group_id": group.id,
        "sa_id": sa.id, "dr_id": dr.id, "patient_id": patient.id,
    }


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200
    return r.json()["access_token"]


def _next_weekday(d: date) -> date:
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


@pytest.mark.asyncio
async def test_procedure_durations_endpoint(client: AsyncClient, seed):
    token = await login(client, "sa_sched@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.get("/api/v1/appointments/procedure-durations", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "procedures" in data
    assert data["procedures"]["Root Canal"] == 90
    assert data["procedures"]["Implant"] == 120
    assert data["procedures"]["Scaling"] == 30


@pytest.mark.asyncio
async def test_slots_with_procedure_name_resolves_duration(client: AsyncClient, seed):
    token = await login(client, "sa_sched@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    future_date = _next_weekday(date.today() + timedelta(days=1))
    r = await client.get(
        "/api/v1/appointments/slots",
        params={"doctor_id": seed["dr_id"], "date": future_date.isoformat(), "procedure_name": "Root Canal"},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["duration_minutes"] == 90
    assert data["procedure_name"] == "Root Canal"
    assert isinstance(data["slots"], list)
    assert len(data["slots"]) > 0


@pytest.mark.asyncio
async def test_slots_with_procedure_name_case_insensitive(client: AsyncClient, seed):
    token = await login(client, "sa_sched@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    future_date = _next_weekday(date.today() + timedelta(days=1))
    r = await client.get(
        "/api/v1/appointments/slots",
        params={"doctor_id": seed["dr_id"], "date": future_date.isoformat(), "procedure_name": "root canal"},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["duration_minutes"] == 90


@pytest.mark.asyncio
async def test_slots_with_unknown_procedure_defaults_to_30(client: AsyncClient, seed):
    token = await login(client, "sa_sched@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    future_date = _next_weekday(date.today() + timedelta(days=1))
    r = await client.get(
        "/api/v1/appointments/slots",
        params={"doctor_id": seed["dr_id"], "date": future_date.isoformat(),
                "procedure_name": "Unknown Procedure X"},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["duration_minutes"] == 30


@pytest.mark.asyncio
async def test_slots_on_leave_returns_empty(client: AsyncClient, db_session, seed):
    from app.models.doctor_leave import DoctorLeave, LeaveStatus
    leave = DoctorLeave(
        doctor_id=seed["dr_id"],
        hospital_id=seed["hospital_id"],
        start_date=date.today() + timedelta(days=30),
        end_date=date.today() + timedelta(days=35),
        reason="Vacation",
        status=LeaveStatus.APPROVED,
    )
    db_session.add(leave)
    await db_session.commit()

    token = await login(client, "sa_sched@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    leave_date = date.today() + timedelta(days=31)
    r = await client.get(
        "/api/v1/appointments/slots",
        params={"doctor_id": seed["dr_id"], "date": leave_date.isoformat(), "procedure_name": "Consultation"},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["is_on_leave"] is True
    assert data["slots"] == []
    assert data["duration_minutes"] == 20


@pytest.mark.asyncio
async def test_create_appointment_with_procedure_name(client: AsyncClient, seed):
    token = await login(client, "sa_sched@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    future_date = _next_weekday(date.today() + timedelta(days=1))
    r = await client.post(
        "/api/v1/appointments/",
        headers=headers,
        json={
            "patient_id": seed["patient_id"],
            "doctor_id": seed["dr_id"],
            "appointment_date": future_date.isoformat(),
            "appointment_time": "10:00:00",
            "procedure_name": "Scaling",
            "duration_minutes": 30,
            "notes": "Test with procedure",
        },
    )
    assert r.status_code == 201, f"Create failed: {r.text}"
    data = r.json()
    assert data["duration_minutes"] == 30
    appt_id = data["id"]

    r2 = await client.get(f"/api/v1/appointments/{appt_id}", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["duration_minutes"] == 30


@pytest.mark.asyncio
async def test_create_appointment_rct_uses_90_min(client: AsyncClient, seed):
    token = await login(client, "sa_sched@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    future_date = _next_weekday(date.today() + timedelta(days=1))
    r = await client.post(
        "/api/v1/appointments/",
        headers=headers,
        json={
            "patient_id": seed["patient_id"],
            "doctor_id": seed["dr_id"],
            "appointment_date": future_date.isoformat(),
            "appointment_time": "10:00:00",
            "procedure_name": "Root Canal",
            "duration_minutes": 90,
            "notes": "RCT test",
        },
    )
    assert r.status_code == 201, f"Create failed: {r.text}"
    assert r.json()["duration_minutes"] == 90


@pytest.mark.asyncio
async def test_reschedule_validates_new_slot(client: AsyncClient, seed):
    token = await login(client, "sa_sched@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    future_date = _next_weekday(date.today() + timedelta(days=1))

    r1 = await client.post(
        "/api/v1/appointments/",
        headers=headers,
        json={
            "patient_id": seed["patient_id"],
            "doctor_id": seed["dr_id"],
            "appointment_date": future_date.isoformat(),
            "appointment_time": "10:00:00",
            "procedure_name": "Consultation",
            "duration_minutes": 20,
        },
    )
    assert r1.status_code == 201
    appt_id = r1.json()["id"]

    r2 = await client.post(
        f"/api/v1/appointments/{appt_id}/reschedule",
        headers=headers,
        json={
            "appointment_date": future_date.isoformat(),
            "appointment_time": "13:30:00",
            "reason": "Lunch hour conflict",
        },
    )
    assert r2.status_code == 400
    assert "lunch" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_reschedule_sets_correct_end_time(client: AsyncClient, seed):
    token = await login(client, "sa_sched@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    future_date = _next_weekday(date.today() + timedelta(days=1))

    r1 = await client.post(
        "/api/v1/appointments/",
        headers=headers,
        json={
            "patient_id": seed["patient_id"],
            "doctor_id": seed["dr_id"],
            "appointment_date": future_date.isoformat(),
            "appointment_time": "10:00:00",
            "procedure_name": "Root Canal",
            "duration_minutes": 90,
        },
    )
    assert r1.status_code == 201
    appt_id = r1.json()["id"]

    r2 = await client.post(
        f"/api/v1/appointments/{appt_id}/reschedule",
        headers=headers,
        json={
            "appointment_date": future_date.isoformat(),
            "appointment_time": "14:30:00",
        },
    )
    assert r2.status_code == 200
    data = r2.json()
    assert data["appointment_time"] == "14:30:00"
    assert data["appointment_date"] == future_date.isoformat()
    assert data["previous_date"] is not None
    assert data["previous_time"] is not None
    assert data["status"] == "SCHEDULED"


@pytest.mark.asyncio
async def test_slots_duration_override_by_admin(client: AsyncClient, seed):
    token = await login(client, "sa_sched@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    future_date = _next_weekday(date.today() + timedelta(days=1))

    r = await client.get(
        "/api/v1/appointments/slots",
        params={"doctor_id": seed["dr_id"], "date": future_date.isoformat(),
                "procedure_name": "Consultation", "duration_minutes": 45},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["duration_minutes"] == 45


@pytest.mark.asyncio
async def test_consecutive_slots_unavailable_for_long_procedure(client: AsyncClient, seed):
    token = await login(client, "sa_sched@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    future_date = _next_weekday(date.today() + timedelta(days=1))

    r1 = await client.post(
        "/api/v1/appointments/",
        headers=headers,
        json={
            "patient_id": seed["patient_id"],
            "doctor_id": seed["dr_id"],
            "appointment_date": future_date.isoformat(),
            "appointment_time": "10:00:00",
            "procedure_name": "Root Canal",
            "duration_minutes": 90,
        },
    )
    assert r1.status_code == 201

    r2 = await client.get(
        "/api/v1/appointments/slots",
        params={"doctor_id": seed["dr_id"], "date": future_date.isoformat(), "procedure_name": "Root Canal"},
        headers=headers,
    )
    assert r2.status_code == 200
    slots = r2.json()["slots"]
    for slot in slots:
        if slot["time"] in ("10:00", "10:30", "11:00"):
            assert slot["available"] is False, f"Slot {slot['time']} should be blocked by RCT appointment"
