"""Tests for the patient-first billing workflow: patient search, billable
treatments, line-item creation with duplicate/cross-case guards, and the
financial sync (case / treatment plan / treatment sitting) driven by billing."""

import pytest
import uuid
from datetime import datetime, date, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select
from app.database import Base, get_db
from app.main import app
from app.core.security import hash_password
from app.core.permissions import Role
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User
from app.models.patient import Patient
from app.models.case import Case, CaseStatus
from app.models.billing import Billing, PaymentStatus
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.treatment_sitting import TreatmentSitting, TreatmentSittingStatus

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
    today = date.today()

    ag1 = AdminGroup(id=str(uuid.uuid4()), name="Group Alpha", description="First group")
    ag2 = AdminGroup(id=str(uuid.uuid4()), name="Group Beta", description="Second group")
    db_session.add_all([ag1, ag2])
    await db_session.flush()

    h1 = Hospital(id=str(uuid.uuid4()), admin_group_id=ag1.id, name="Hospital Alpha-1")
    h2 = Hospital(id=str(uuid.uuid4()), admin_group_id=ag2.id, name="Hospital Beta-1")
    db_session.add_all([h1, h2])
    await db_session.flush()

    sa = User(id=str(uuid.uuid4()), email="super@test.com", password_hash=hash_password("Pass123!"), full_name="Super", role=Role.SUPER_ADMIN, is_verified=True)
    doc1 = User(id=str(uuid.uuid4()), email="doc1@test.com", password_hash=hash_password("Pass123!"), full_name="Dr. One", role=Role.DOCTOR, hospital_id=h1.id, admin_group_id=ag1.id, is_verified=True)
    doc2 = User(id=str(uuid.uuid4()), email="doc2@test.com", password_hash=hash_password("Pass123!"), full_name="Dr. Two", role=Role.DOCTOR, hospital_id=h2.id, admin_group_id=ag2.id, is_verified=True)
    db_session.add_all([sa, doc1, doc2])
    await db_session.flush()

    p1 = Patient(id=str(uuid.uuid4()), hospital_id=h1.id, doctor_id=doc1.id, full_name="Patient One", phone="+919000000001")
    p2 = Patient(id=str(uuid.uuid4()), hospital_id=h1.id, doctor_id=doc1.id, full_name="Patient Two", phone="+919000000002")
    p3 = Patient(id=str(uuid.uuid4()), hospital_id=h2.id, doctor_id=doc2.id, full_name="Patient Three (Other Group)", phone="+919000000003")
    db_session.add_all([p1, p2, p3])
    await db_session.flush()

    c1 = Case(id=str(uuid.uuid4()), patient_id=p1.id, doctor_id=doc1.id, chief_complaint="Tooth pain", status=CaseStatus.IN_PROGRESS, created_at=now - timedelta(days=10))
    c2 = Case(id=str(uuid.uuid4()), patient_id=p2.id, doctor_id=doc1.id, chief_complaint="Cleaning", status=CaseStatus.COMPLETED, created_at=now - timedelta(days=5))
    c3 = Case(id=str(uuid.uuid4()), patient_id=p3.id, doctor_id=doc2.id, chief_complaint="Checkup", status=CaseStatus.IN_PROGRESS, created_at=now - timedelta(days=2))
    db_session.add_all([c1, c2, c3])
    await db_session.flush()

    b1 = Billing(id=str(uuid.uuid4()), case_id=c1.id, total_amount=5000, paid_amount=3000, pending_amount=2000, payment_status=PaymentStatus.PARTIAL, updated_at=now - timedelta(days=3))
    db_session.add(b1)

    plan1 = TreatmentPlan(id=str(uuid.uuid4()), case_id=c1.id, treatment_name="Root Canal", cost=10000, total_sittings=2, completed_sittings=1, remaining_sittings=1, status=TreatmentPlanStatus.IN_PROGRESS, is_active=True)
    plan1b = TreatmentPlan(id=str(uuid.uuid4()), case_id=c1.id, treatment_name="Scaling", cost=5000, total_sittings=1, completed_sittings=0, remaining_sittings=1, status=TreatmentPlanStatus.ASSIGNED, is_active=True)
    plan2 = TreatmentPlan(id=str(uuid.uuid4()), case_id=c2.id, treatment_name="Cleaning", cost=4000, total_sittings=1, completed_sittings=1, remaining_sittings=0, status=TreatmentPlanStatus.COMPLETED, is_active=True)
    db_session.add_all([plan1, plan1b, plan2])
    await db_session.flush()

    s1 = TreatmentSitting(id=str(uuid.uuid4()), treatment_plan_id=plan1.id, sitting_number=1, sitting_date=today, status=TreatmentSittingStatus.COMPLETED)
    s2 = TreatmentSitting(id=str(uuid.uuid4()), treatment_plan_id=plan1.id, sitting_number=2, sitting_date=today, status=TreatmentSittingStatus.PLANNED)
    s3 = TreatmentSitting(id=str(uuid.uuid4()), treatment_plan_id=plan2.id, sitting_number=1, sitting_date=today, status=TreatmentSittingStatus.COMPLETED)
    db_session.add_all([s1, s2, s3])
    await db_session.flush()

    await db_session.commit()
    return {
        "ag1": ag1, "ag2": ag2, "h1": h1, "h2": h2,
        "sa": sa, "doc1": doc1, "doc2": doc2,
        "p1": p1, "p2": p2, "p3": p3,
        "c1": c1, "c2": c2, "c3": c3,
        "b1": b1,
        "plan1": plan1, "plan1b": plan1b, "plan2": plan2,
        "s1": s1, "s2": s2, "s3": s3,
    }


async def get_case_financials(case_id):
    async with test_session_factory() as db:
        case = await db.get(Case, case_id)
        await db.refresh(case)
        return {
            "total_billed": case.total_billed,
            "total_paid": case.total_paid,
            "outstanding_balance": case.outstanding_balance,
            "payment_status": case.payment_status,
            "estimated_cost": case.estimated_cost,
        }


async def get_plan_financials(plan_id):
    async with test_session_factory() as db:
        plan = await db.get(TreatmentPlan, plan_id)
        await db.refresh(plan)
        return {"paid_amount": plan.paid_amount}


async def get_sitting_financials(sitting_id):
    async with test_session_factory() as db:
        s = await db.get(TreatmentSitting, sitting_id)
        await db.refresh(s)
        return {"paid_amount": s.paid_amount, "charge": s.charge, "invoice_status": s.invoice_status}


# ==========================
# TEST: PATIENT SEARCH (patient-first invoice)
# ==========================

@pytest.mark.asyncio
async def test_billing_search_by_patient_name(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    resp = await client.get(f"/api/v1/billings/search?q={seeds['p1'].full_name}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    item = next((i for i in data["items"] if i["id"] == seeds["p1"].id), None)
    assert item is not None
    assert item["full_name"] == "Patient One"
    assert "financial_summary" in item
    assert "total_billed" in item["financial_summary"]
    # Active case surfaced with financial summary
    assert any(c["id"] == seeds["c1"].id for c in item["active_cases"])
    active = next(c for c in item["active_cases"] if c["id"] == seeds["c1"].id)
    assert active["chief_complaint"] == "Tooth pain"
    assert "estimated_cost" in active
    assert "outstanding_balance" in active


@pytest.mark.asyncio
async def test_billing_search_scoped_by_role(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "doc1@test.com", "Pass123!")
    resp = await client.get("/api/v1/billings/search?q=Patient", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    names = [i["full_name"] for i in data["items"]]
    assert "Patient One" in names
    assert "Patient Two" in names
    # Group isolation: doc1 (Group Alpha) must not see Group Beta patients
    assert "Patient Three (Other Group)" not in names


@pytest.mark.asyncio
async def test_billing_search_requires_query(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    resp = await client.get("/api/v1/billings/search", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 422


# ==========================
# TEST: BILLABLE TREATMENTS
# ==========================

@pytest.mark.asyncio
async def test_billable_treatments_endpoint(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    resp = await client.get(f"/api/v1/billings/cases/{seeds['c1'].id}/billable", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["case"]["id"] == seeds["c1"].id
    assert data["case"]["chief_complaint"] == "Tooth pain"
    plans = data["treatment_plans"]
    names = [p["treatment_name"] for p in plans]
    assert "Root Canal" in names
    assert "Scaling" in names
    root = next(p for p in plans if p["treatment_name"] == "Root Canal")
    assert root["cost"] == 10000
    assert len(root["sittings"]) == 2
    sitting_fields = {k: root["sittings"][0].get(k) for k in ("charge", "paid_amount", "invoice_status")}
    assert set(sitting_fields.keys()) == {"charge", "paid_amount", "invoice_status"}


@pytest.mark.asyncio
async def test_billable_treatments_not_found(client):
    async with test_session_factory() as db:
        await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    resp = await client.get(f"/api/v1/billings/cases/{uuid.uuid4()}/billable", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


# ==========================
# TEST: LINE-ITEM CREATION + FINANCIAL SYNC
# ==========================

@pytest.mark.asyncio
async def test_create_billing_with_sitting_item_syncs_financials(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    resp = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "patient_id": seeds["p1"].id,
        "paid_amount": 2000,
        "payment_method": "Cash",
        "items": [{
            "treatment_plan_id": seeds["plan1"].id,
            "treatment_sitting_id": seeds["s1"].id,
            "unit_price": 5000,
            "quantity": 1,
        }],
    }, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 201, resp.text
    billing = resp.json()
    assert billing["total_amount"] == 5000
    assert billing["paid_amount"] == 2000
    assert billing["pending_amount"] == 3000
    assert billing["payment_status"] == "PARTIAL"
    assert len(billing["items"]) == 1
    item = billing["items"][0]
    assert item["amount"] == 5000
    assert item["net_amount"] == 5000
    # paid share is net-proportional
    assert item["paid_amount"] == 2000
    assert item["pending_amount"] == 3000
    assert item["treatment_sitting_number"] == 1

    # Billing is the source of truth: case / plan / sitting all updated
    case_f = await get_case_financials(seeds["c1"].id)
    assert case_f["total_billed"] == 10000  # 5000 (new) + 5000 (b1)
    assert case_f["total_paid"] == 5000     # 2000 (new) + 3000 (b1)
    assert case_f["outstanding_balance"] == 5000
    assert case_f["payment_status"] == "PARTIAL"
    assert case_f["estimated_cost"] == 15000  # plan1 10000 + plan1b 5000

    plan_f = await get_plan_financials(seeds["plan1"].id)
    assert plan_f["paid_amount"] == 2000

    s1_f = await get_sitting_financials(seeds["s1"].id)
    assert s1_f["paid_amount"] == 2000
    assert s1_f["invoice_status"] == "INVOICED"
    assert s1_f["charge"] == 5000

    s2_f = await get_sitting_financials(seeds["s2"].id)
    assert s2_f["paid_amount"] == 0
    assert s2_f["invoice_status"] == "NOT_INVOICED"


@pytest.mark.asyncio
async def test_create_billing_with_plan_item_first_time(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    resp = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "paid_amount": 3000,
        "items": [{
            "treatment_plan_id": seeds["plan1"].id,
            "unit_price": 10000,
            "quantity": 1,
        }],
    }, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 201, resp.text
    billing = resp.json()
    assert billing["total_amount"] == 10000
    plan_f = await get_plan_financials(seeds["plan1"].id)
    assert plan_f["paid_amount"] == 3000


@pytest.mark.asyncio
async def test_fully_billed_plan_blocks_second_invoice(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    first = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "paid_amount": 10000,
        "items": [{"treatment_plan_id": seeds["plan1"].id, "unit_price": 10000}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert first.status_code == 201, first.text

    second = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "items": [{"treatment_plan_id": seeds["plan1"].id, "unit_price": 1000}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert second.status_code == 400
    assert "already fully billed" in second.json()["detail"]


@pytest.mark.asyncio
async def test_duplicate_sitting_invoice_blocked(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    first = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "items": [{"treatment_plan_id": seeds["plan1"].id, "treatment_sitting_id": seeds["s1"].id, "unit_price": 5000}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert first.status_code == 201, first.text

    second = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "items": [{"treatment_plan_id": seeds["plan1"].id, "treatment_sitting_id": seeds["s1"].id, "unit_price": 5000}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert second.status_code == 400
    assert "already been invoiced" in second.json()["detail"]


@pytest.mark.asyncio
async def test_duplicate_sitting_allowed_with_flag(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    first = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "items": [{"treatment_plan_id": seeds["plan1"].id, "treatment_sitting_id": seeds["s1"].id, "unit_price": 5000}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert first.status_code == 201

    second = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "items": [{"treatment_plan_id": seeds["plan1"].id, "treatment_sitting_id": seeds["s1"].id, "unit_price": 5000, "allow_duplicate": True}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert second.status_code == 201, second.text


@pytest.mark.asyncio
async def test_cross_case_item_blocked(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    resp = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "items": [{"treatment_sitting_id": seeds["s3"].id, "unit_price": 4000}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 400
    assert "another case" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_patient_id_mismatch_blocked(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    resp = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "patient_id": seeds["p2"].id,
        "items": [{"treatment_plan_id": seeds["plan1"].id, "unit_price": 5000}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 400
    assert "must belong to the selected patient" in resp.json()["detail"]


# ==========================
# TEST: DISCOUNT REDISTRIBUTION + PAYMENT SYNC
# ==========================

@pytest.mark.asyncio
async def test_discount_redistributes_across_items(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    create = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "items": [
            {"treatment_plan_id": seeds["plan1"].id, "unit_price": 5000},
            {"treatment_plan_id": seeds["plan1b"].id, "unit_price": 5000},
        ],
    }, headers={"Authorization": f"Bearer {token}"})
    assert create.status_code == 201, create.text
    billing = create.json()
    assert billing["total_amount"] == 10000

    resp = await client.put(f"/api/v1/billings/{billing['id']}/discount", json={
        "discount_type": "FIXED",
        "discount_amount": 1000,
    }, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    updated = resp.json()
    assert updated["discount_amount"] == 1000
    assert updated["total_amount"] == 9000
    assert len(updated["items"]) == 2
    for item in updated["items"]:
        assert item["amount"] == 5000
        assert item["discount_amount"] == 500
        assert item["net_amount"] == 4500
    assert sum(i["net_amount"] for i in updated["items"]) == 9000


@pytest.mark.asyncio
async def test_payment_update_syncs_plan_and_sitting(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    create = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "items": [{"treatment_plan_id": seeds["plan1"].id, "treatment_sitting_id": seeds["s1"].id, "unit_price": 5000}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert create.status_code == 201, create.text
    billing = create.json()
    assert billing["pending_amount"] == 5000

    pay = await client.put(f"/api/v1/billings/{billing['id']}/payment", json={
        "paid_amount": 2000,
        "payment_method": "Cash",
    }, headers={"Authorization": f"Bearer {token}"})
    assert pay.status_code == 200, pay.text
    updated = pay.json()
    assert updated["paid_amount"] == 2000
    assert updated["pending_amount"] == 3000

    plan_f = await get_plan_financials(seeds["plan1"].id)
    assert plan_f["paid_amount"] == 2000

    s1_f = await get_sitting_financials(seeds["s1"].id)
    assert s1_f["paid_amount"] == 2000

    case_f = await get_case_financials(seeds["c1"].id)
    assert case_f["total_paid"] == 5000  # 2000 (new) + 3000 (b1)


@pytest.mark.asyncio
async def test_delete_billing_resyncs_case(client):
    async with test_session_factory() as db:
        seeds = await seed_data(db)

    token, _ = await login_as(client, "super@test.com", "Pass123!")
    create = await client.post("/api/v1/billings/", json={
        "case_id": seeds["c1"].id,
        "items": [{"treatment_plan_id": seeds["plan1"].id, "unit_price": 10000}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert create.status_code == 201, create.text
    billing = create.json()

    case_f = await get_case_financials(seeds["c1"].id)
    assert case_f["total_billed"] == 15000

    delete = await client.delete(f"/api/v1/billings/{billing['id']}", headers={"Authorization": f"Bearer {token}"})
    assert delete.status_code == 200

    case_f = await get_case_financials(seeds["c1"].id)
    assert case_f["total_billed"] == 5000  # only b1 remains
    assert case_f["total_paid"] == 3000
    assert case_f["payment_status"] == "PARTIAL"
