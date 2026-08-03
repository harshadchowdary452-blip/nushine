"""Comprehensive tests for dashboards, tenant isolation, billing PDF generation."""

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.database import Base, get_db
from app.main import app
from app.core.security import hash_password
from app.core.permissions import Role
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User
from app.models.patient import Patient
from app.models.case import Case, CaseStatus
from app.models.appointment import Appointment, AppointmentStatus
from app.models.billing import Billing, PaymentStatus
from app.models.treatment_plan import TreatmentPlan
from datetime import datetime, date, time, timezone, timedelta
import uuid

TEST_DB_URL = "sqlite+aiosqlite://"
engine = create_async_engine(TEST_DB_URL, echo=False, connect_args={"check_same_thread": False})
test_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db():
    async with test_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@pytest.fixture
async def client():
    app.dependency_overrides[get_db] = override_get_db
    from app.main import limiter as main_limiter
    from app.routers.auth import limiter as auth_limiter
    main_limiter.enabled = False
    auth_limiter.enabled = False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
    main_limiter.enabled = True
    auth_limiter.enabled = True


@pytest.fixture
async def db_session():
    async with test_session_factory() as session:
        yield session


async def login_as(client, email, password):
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    data = resp.json()
    return data["access_token"], data["user"]


async def seed_data(db_session):
    now = datetime.now(timezone.utc)

    # Create admin groups
    ag1 = AdminGroup(id=str(uuid.uuid4()), name="Group Alpha", description="First group")
    ag2 = AdminGroup(id=str(uuid.uuid4()), name="Group Beta", description="Second group")
    db_session.add_all([ag1, ag2])
    await db_session.flush()

    # Create hospitals
    h1 = Hospital(id=str(uuid.uuid4()), admin_group_id=ag1.id, name="Hospital Alpha-1")
    h2 = Hospital(id=str(uuid.uuid4()), admin_group_id=ag1.id, name="Hospital Alpha-2")
    h3 = Hospital(id=str(uuid.uuid4()), admin_group_id=ag2.id, name="Hospital Beta-1")
    db_session.add_all([h1, h2, h3])
    await db_session.flush()

    # Create users
    sa = User(id=str(uuid.uuid4()), email="super@test.com", password_hash=hash_password("Pass123!"), full_name="Super", role=Role.SUPER_ADMIN, is_verified=True)
    ga = User(id=str(uuid.uuid4()), email="ga@test.com", password_hash=hash_password("Pass123!"), full_name="Group Admin", role=Role.GROUP_ADMIN, admin_group_id=ag1.id, is_verified=True)
    ha = User(id=str(uuid.uuid4()), email="ha@test.com", password_hash=hash_password("Pass123!"), full_name="Hosp Admin", role=Role.HOSPITAL_ADMIN, hospital_id=h1.id, admin_group_id=ag1.id, is_verified=True)
    doc1 = User(id=str(uuid.uuid4()), email="doc1@test.com", password_hash=hash_password("Pass123!"), full_name="Dr. One", role=Role.DOCTOR, hospital_id=h1.id, admin_group_id=ag1.id, is_verified=True)
    doc2 = User(id=str(uuid.uuid4()), email="doc2@test.com", password_hash=hash_password("Pass123!"), full_name="Dr. Two", role=Role.DOCTOR, hospital_id=h2.id, admin_group_id=ag1.id, is_verified=True)
    doc3 = User(id=str(uuid.uuid4()), email="doc3@test.com", password_hash=hash_password("Pass123!"), full_name="Dr. Three", role=Role.DOCTOR, hospital_id=h3.id, admin_group_id=ag2.id, is_verified=True)
    db_session.add_all([sa, ga, ha, doc1, doc2, doc3])
    await db_session.flush()

    # Create patients
    p1 = Patient(id=str(uuid.uuid4()), hospital_id=h1.id, doctor_id=doc1.id, full_name="Patient One")
    p2 = Patient(id=str(uuid.uuid4()), hospital_id=h1.id, doctor_id=doc1.id, full_name="Patient Two")
    p3 = Patient(id=str(uuid.uuid4()), hospital_id=h2.id, doctor_id=doc2.id, full_name="Patient Three")
    p4 = Patient(id=str(uuid.uuid4()), hospital_id=h3.id, doctor_id=doc3.id, full_name="Patient Four (Other Group)")
    db_session.add_all([p1, p2, p3, p4])
    await db_session.flush()

    # Create cases
    c1 = Case(id=str(uuid.uuid4()), patient_id=p1.id, doctor_id=doc1.id, chief_complaint="Tooth pain", status=CaseStatus.IN_PROGRESS, created_at=now - timedelta(days=10))
    c2 = Case(id=str(uuid.uuid4()), patient_id=p2.id, doctor_id=doc1.id, chief_complaint="Cleaning", status=CaseStatus.COMPLETED, created_at=now - timedelta(days=5))
    c3 = Case(id=str(uuid.uuid4()), patient_id=p3.id, doctor_id=doc2.id, chief_complaint="Root canal", status=CaseStatus.OPEN, created_at=now - timedelta(days=2))
    c4 = Case(id=str(uuid.uuid4()), patient_id=p4.id, doctor_id=doc3.id, chief_complaint="Checkup (other)", status=CaseStatus.IN_PROGRESS)
    db_session.add_all([c1, c2, c3, c4])
    await db_session.flush()

    # Create billings
    b1 = Billing(id=str(uuid.uuid4()), case_id=c1.id, total_amount=5000, paid_amount=3000, pending_amount=2000, payment_status=PaymentStatus.PARTIAL, updated_at=now - timedelta(days=3))
    b2 = Billing(id=str(uuid.uuid4()), case_id=c2.id, total_amount=2000, paid_amount=2000, pending_amount=0, payment_status=PaymentStatus.PAID, updated_at=now - timedelta(days=1))
    b3 = Billing(id=str(uuid.uuid4()), case_id=c3.id, total_amount=8000, paid_amount=0, pending_amount=8000, payment_status=PaymentStatus.DRAFT)
    b4 = Billing(id=str(uuid.uuid4()), case_id=c4.id, total_amount=3000, paid_amount=3000, pending_amount=0, payment_status=PaymentStatus.PAID)
    db_session.add_all([b1, b2, b3, b4])
    await db_session.flush()

    # Create appointments
    today = date.today()
    a1 = Appointment(id=str(uuid.uuid4()), patient_id=p1.id, doctor_id=doc1.id, appointment_date=today, appointment_time=time(10, 0), duration_minutes=30, end_time=time(10, 30), is_active=True)
    a2 = Appointment(id=str(uuid.uuid4()), patient_id=p2.id, doctor_id=doc1.id, appointment_date=today, appointment_time=time(11, 0), duration_minutes=30, end_time=time(11, 30), is_active=True)
    a3 = Appointment(id=str(uuid.uuid4()), patient_id=p3.id, doctor_id=doc2.id, appointment_date=today, appointment_time=time(12, 0), duration_minutes=30, end_time=time(12, 30), is_active=True)
    a4 = Appointment(id=str(uuid.uuid4()), patient_id=p4.id, doctor_id=doc3.id, appointment_date=today, appointment_time=time(13, 0), duration_minutes=30, end_time=time(13, 30), is_active=True)
    db_session.add_all([a1, a2, a3, a4])
    await db_session.flush()

    await db_session.commit()
    return {
        "ag1": ag1, "ag2": ag2,
        "h1": h1, "h2": h2, "h3": h3,
        "sa": sa, "ga": ga, "ha": ha,
        "doc1": doc1, "doc2": doc2, "doc3": doc3,
        "p1": p1, "p2": p2, "p3": p3, "p4": p4,
        "c1": c1, "c2": c2, "c3": c3, "c4": c4,
        "b1": b1, "b2": b2, "b3": b3, "b4": b4,
    }


# ==========================
# TEST: SUPER ADMIN DASHBOARD
# ==========================

@pytest.mark.asyncio
async def test_super_admin_dashboard_counts(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    resp = await client.get("/api/v1/dashboards/super-admin", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_groups"] == 2
    assert data["total_hospitals"] == 3
    assert data["total_doctors"] == 3
    assert data["total_patients"] == 4
    assert data["total_active_cases"] >= 2  # c1, c4 are in_progress
    assert data["total_appointments"] == 4
    assert data["total_revenue"] == 8000.0  # 3000 + 2000 + 0 + 3000
    assert data["total_groups"] > 0
    assert len(data["admin_group_performance"]) == 2
    assert len(data["hospital_performance"]) >= 2
    assert len(data["doctor_performance"]) >= 2


@pytest.mark.asyncio
async def test_super_admin_dashboard_revenue(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    resp = await client.get("/api/v1/dashboards/super-admin", headers={"Authorization": f"Bearer {token}"})
    data = resp.json()
    assert data["total_revenue"] > 0
    assert data["monthly_revenue"] >= 0
    assert data["yearly_revenue"] >= 0
    assert len(data["revenue_trend"]) >= 0
    assert len(data["monthly_growth_trend"]) > 0


# ==========================
# TEST: GROUP ADMIN DASHBOARD (TENANT ISOLATION)
# ==========================

@pytest.mark.asyncio
async def test_group_admin_dashboard_isolated(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "ga@test.com", "Pass123!")
    resp = await client.get("/api/v1/dashboards/group-admin", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    # Group Alpha has 2 hospitals, 2 doctors (doc1, doc2), 3 patients (p1, p2, p3)
    assert data["total_hospitals"] == 2
    assert data["total_doctors"] == 2
    assert data["total_patients"] == 3
    assert data["total_revenue"] == 5000.0  # b1=3000 + b2=2000 + b3=0
    assert len(data["hospital_performance"]) == 2
    assert len(data["doctor_performance"]) == 2


@pytest.mark.asyncio
async def test_group_admin_cannot_see_other_group(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "ga@test.com", "Pass123!")
    resp = await client.get("/api/v1/dashboards/group-admin", headers={"Authorization": f"Bearer {token}"})
    data = resp.json()
    # Should NOT include data from Group Beta
    assert data["total_hospitals"] == 2  # not 3
    assert data["total_doctors"] == 2  # not 3
    assert data["total_patients"] == 3  # not 4
    # Revenue should not include b4 (3000 from other group)
    assert data["total_revenue"] == 5000.0  # not 8000

    # Hospital performance should not include h3
    hosp_names = [h["name"] for h in data["hospital_performance"]]
    assert "Hospital Beta-1" not in hosp_names


# ==========================
# TEST: HOSPITAL ADMIN DASHBOARD
# ==========================

@pytest.mark.asyncio
async def test_hospital_admin_dashboard_isolated(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "ha@test.com", "Pass123!")
    resp = await client.get("/api/v1/dashboards/hospital-admin", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    # Hospital h1 has 2 patients (p1, p2), 1 doctor (doc1)
    assert data["total_patients"] == 2
    assert data["today_appointments"] == 2  # a1, a2
    assert data["total_revenue"] == 5000.0  # b1=3000 + b2=2000
    assert len(data["doctor_performance"]) == 1


@pytest.mark.asyncio
async def test_hospital_admin_cannot_see_other_hospital(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "ha@test.com", "Pass123!")
    resp = await client.get("/api/v1/dashboards/hospital-admin", headers={"Authorization": f"Bearer {token}"})
    data = resp.json()
    # Should NOT see h2 or h3 data
    assert data["total_patients"] == 2  # not 4
    # Doctor performance should only have doc1
    doc_names = [d["name"] for d in data["doctor_performance"]]
    assert "Dr. Two" not in doc_names
    assert "Dr. Three" not in doc_names


# ==========================
# TEST: DOCTOR DASHBOARD
# ==========================

@pytest.mark.asyncio
async def test_doctor_dashboard_isolated(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "doc1@test.com", "Pass123!")
    resp = await client.get("/api/v1/dashboards/doctor", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["my_patients"] == 2  # p1, p2
    assert data["today_appointments"] == 2  # a1, a2
    assert data["active_cases"] == 1  # c1 is in_progress
    assert data["cases_completed"] == 1  # c2 is completed
    assert data["personal_revenue"] == 5000.0  # b1=3000 + b2=2000


@pytest.mark.asyncio
async def test_doctor_cannot_see_other_doctor_data(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "doc1@test.com", "Pass123!")
    resp = await client.get("/api/v1/dashboards/doctor", headers={"Authorization": f"Bearer {token}"})
    data = resp.json()
    # Should not see doc2's patients or revenue
    assert data["my_patients"] == 2  # not 4
    assert data["personal_revenue"] == 5000.0  # not 13000


# ==========================
# TEST: QUICK VIEW
# ==========================

@pytest.mark.asyncio
async def test_quick_view_admin_group(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    resp = await client.get(f"/api/v1/dashboards/quick-view/admin-group/{seeds['ag1'].id}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_hospitals"] == 2
    assert data["total_doctors"] == 2
    assert data["total_patients"] == 3
    assert len(data["top_doctors"]) == 2


@pytest.mark.asyncio
async def test_quick_view_hospital(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "ga@test.com", "Pass123!")
    resp = await client.get(f"/api/v1/dashboards/quick-view/hospital/{seeds['h1'].id}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_patients"] == 2
    assert data["today_appointments"] == 2


@pytest.mark.asyncio
async def test_quick_view_hospital_cross_group_blocked(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "ga@test.com", "Pass123!")
    # Group Admin of Group Alpha should not access h3 (Group Beta)
    resp = await client.get(f"/api/v1/dashboards/quick-view/hospital/{seeds['h3'].id}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_quick_view_doctor(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "ha@test.com", "Pass123!")
    resp = await client.get(f"/api/v1/dashboards/quick-view/doctor/{seeds['doc1'].id}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_patients"] == 2
    assert data["today_appointments"] == 2
    assert data["active_cases"] == 1


@pytest.mark.asyncio
async def test_quick_view_doctor_cross_hospital_blocked(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "ha@test.com", "Pass123!")
    # Hospital Admin of h1 should not access doc2 (h2)
    resp = await client.get(f"/api/v1/dashboards/quick-view/doctor/{seeds['doc3'].id}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_quick_view_patient(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "doc1@test.com", "Pass123!")
    resp = await client.get(f"/api/v1/dashboards/quick-view/patient/{seeds['p1'].id}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_cases"] >= 1
    assert data["total_billed"] >= 0
    assert len(data["timeline"]) > 0


@pytest.mark.asyncio
async def test_quick_view_patient_cross_doctor_blocked(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "doc1@test.com", "Pass123!")
    # doc1 should not access p3 (doc2's patient)
    resp = await client.get(f"/api/v1/dashboards/quick-view/patient/{seeds['p3'].id}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


# ==========================
# TEST: BILLING PDF
# ==========================

@pytest.mark.asyncio
async def test_billing_pdf_generation(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    # Create a new billing to trigger PDF generation
    resp = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "total_amount": 10000,
        "paid_amount": 5000,
        "payment_method": "Cash",
    }, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 201
    billing = resp.json()
    assert billing["id"] is not None

    # Check PDF endpoint
    pdf_resp = await client.get(f"/api/v1/billings/{billing['id']}/pdf", headers={"Authorization": f"Bearer {token}"})
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"
    assert len(pdf_resp.content) > 0


# ==========================
# TEST: RBAC - PERMISSION DENIAL
# ==========================

@pytest.mark.asyncio
async def test_doctor_cannot_access_super_admin_dashboard(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "doc1@test.com", "Pass123!")
    resp = await client.get("/api/v1/dashboards/super-admin", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_doctor_cannot_access_hospital_admin_dashboard(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "doc1@test.com", "Pass123!")
    resp = await client.get("/api/v1/dashboards/hospital-admin", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_hospital_admin_cannot_access_super_admin_dashboard(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "ha@test.com", "Pass123!")
    resp = await client.get("/api/v1/dashboards/super-admin", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


# ==========================
# TEST: TENANT ISOLATION - PATIENTS API
# ==========================

@pytest.mark.asyncio
async def test_group_admin_sees_only_own_patients(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "ga@test.com", "Pass123!")
    resp = await client.get("/api/v1/patients/", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3  # p1, p2, p3 only
    names = [p["full_name"] for p in data]
    assert "Patient Four (Other Group)" not in names


@pytest.mark.asyncio
async def test_hospital_admin_sees_only_own_patients(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "ha@test.com", "Pass123!")
    resp = await client.get("/api/v1/patients/", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2  # p1, p2 only


@pytest.mark.asyncio
async def test_doctor_sees_only_own_patients(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "doc1@test.com", "Pass123!")
    resp = await client.get("/api/v1/patients/", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    # Doctors see patients across their admin group's hospitals (for case reports),
    # but never patients from other groups.
    assert len(data) == 3  # p1, p2, p3 (Group Alpha)
    names = [p["full_name"] for p in data]
    assert "Patient Four (Other Group)" not in names


# ==========================
# TEST: TENANT ISOLATION - CASES API
# ==========================

@pytest.mark.asyncio
async def test_group_admin_sees_only_own_cases(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "ga@test.com", "Pass123!")
    resp = await client.get("/api/v1/cases/", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3  # c1, c2, c3 only
    complaints = [c["chief_complaint"] for c in data]
    assert "Checkup (other)" not in complaints


# ==========================
# TEST: TENANT ISOLATION - BILLINGS API
# ==========================

@pytest.mark.asyncio
async def test_group_admin_sees_only_own_billings(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "ga@test.com", "Pass123!")
    resp = await client.get("/api/v1/billings/", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3  # b1, b2, b3 only


# ==========================
# TEST: DASHBOARDS RETURN CORRECT TYPES
# ==========================

@pytest.mark.asyncio
async def test_dashboard_response_structure(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    resp = await client.get("/api/v1/dashboards/super-admin", headers={"Authorization": f"Bearer {token}"})
    data = resp.json()
    assert isinstance(data["total_groups"], int)
    assert isinstance(data["total_revenue"], float)
    assert isinstance(data["revenue_trend"], list)
    assert isinstance(data["monthly_growth_trend"], list)
    assert isinstance(data["admin_group_performance"], list)
    assert isinstance(data["hospital_performance"], list)
    assert isinstance(data["doctor_performance"], list)
