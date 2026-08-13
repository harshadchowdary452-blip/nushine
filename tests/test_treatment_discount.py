"""Treatment discount tests:
- PERCENTAGE / FIXED discount applied on a treatment plan, edit-in-place (no compounding)
- validation clamps (FIXED >= cost, PERCENT > 100)
- discount syncs to linked billing and vice versa
- tenant isolation and timeline event
"""
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.billing import Billing
from app.models.case import Case
from app.models.hospital import Hospital
from app.models.patient_timeline import PatientTimeline
from app.models.treatment_plan import TreatmentPlan
from app.models.user import User


@pytest.fixture
async def seed(db_session):
    g1 = AdminGroup(id=str(uuid.uuid4()), name="Discount Group", description="")
    db_session.add(g1)
    await db_session.flush()
    ha = Hospital(id=str(uuid.uuid4()), admin_group_id=g1.id, name="Disc Hosp A")
    hb = Hospital(id=str(uuid.uuid4()), admin_group_id=g1.id, name="Disc Hosp B")
    db_session.add_all([ha, hb])
    await db_session.flush()

    def _user(email, name, role, hospital=None, group=None):
        return User(email=email, password_hash=hash_password("TestPass123"), full_name=name,
                    role=role, hospital_id=hospital.id if hospital else None,
                    admin_group_id=group.id if group else None,
                    is_active=True, is_verified=True)

    users = {
        "SA": _user("disc_sa@t.com", "Disc SA", Role.SUPER_ADMIN),
        "HA": _user("disc_ha@t.com", "Disc HA", Role.HOSPITAL_ADMIN, hospital=ha, group=g1),
        "HB": _user("disc_hb@t.com", "Disc HB", Role.HOSPITAL_ADMIN, hospital=hb, group=g1),
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


async def create_patient_case_plan(client, headers, name, phone, cost=1000):
    r = await client.post("/api/v1/patients/", headers=headers, json={
        "full_name": name, "phone": phone, "gender": "MALE",
    })
    assert r.status_code == 201, f"Create patient failed: {r.text}"
    patient_id = r.json()["id"]
    r = await client.post("/api/v1/cases/", headers=headers, json={
        "patient_id": patient_id, "chief_complaint": "Needs discount",
    })
    assert r.status_code == 201, f"Create case failed: {r.text}"
    case_id = r.json()["id"]
    r = await client.post("/api/v1/treatment-plans/", headers=headers, json={
        "case_id": case_id, "treatment_name": name + " Tx", "cost": cost, "total_sittings": 1,
    })
    assert r.status_code == 201, f"Create plan failed: {r.text}"
    return patient_id, case_id, r.json()["id"]


async def link_billing(db_session, case_id, plan_id, total=1000):
    billing = Billing(id=str(uuid.uuid4()), case_id=case_id, treatment_plan_id=plan_id,
                      original_amount=total, total_amount=total, paid_amount=0,
                      pending_amount=total)
    db_session.add(billing)
    await db_session.commit()
    return billing.id


async def test_percentage_discount_edit_in_place(client, seed):
    ha = auth(await login(client, "disc_ha@t.com"))
    _, _, plan_id = await create_patient_case_plan(client, ha, "Pct Pat", "+919800000001")

    r = await client.put(f"/api/v1/treatment-plans/{plan_id}/discount", headers=ha, json={
        "discount_type": "PERCENTAGE", "discount_percent": 10, "discount_amount": 0,
        "discount_reason": "Loyalty",
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["discount_amount"] == 100.0
    assert d["discount_percent"] == 10.0
    assert d["net_cost"] == 900.0
    assert d["pending_amount"] == 900.0
    assert d["cost"] == 1000
    assert d["discount_reason"] == "Loyalty"

    r = await client.put(f"/api/v1/treatment-plans/{plan_id}/discount", headers=ha, json={
        "discount_type": "PERCENTAGE", "discount_percent": 20, "discount_amount": 0,
        "discount_reason": "Loyalty",
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["discount_amount"] == 200.0, "re-applying must not compound"
    assert d["discount_percent"] == 20.0
    assert d["net_cost"] == 800.0
    assert d["original_amount"] == 1000


async def test_fixed_discount_and_clamps(client, seed):
    ha = auth(await login(client, "disc_ha@t.com"))
    _, _, plan_id = await create_patient_case_plan(client, ha, "Fixed Pat", "+919800000002")

    r = await client.put(f"/api/v1/treatment-plans/{plan_id}/discount", headers=ha, json={
        "discount_type": "FIXED", "discount_amount": 250, "discount_percent": 0,
        "discount_reason": "Friends & Family",
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["discount_amount"] == 250.0
    assert d["net_cost"] == 750.0
    assert d["discount_percent"] == 25.0

    r = await client.put(f"/api/v1/treatment-plans/{plan_id}/discount", headers=ha, json={
        "discount_type": "FIXED", "discount_amount": 1000, "discount_percent": 0,
    })
    assert r.status_code == 400, "FIXED >= cost must be rejected"

    r = await client.put(f"/api/v1/treatment-plans/{plan_id}/discount", headers=ha, json={
        "discount_type": "PERCENTAGE", "discount_percent": 110, "discount_amount": 0,
    })
    assert r.status_code == 422, "PERCENT > 100 must be rejected at validation"


async def test_treatment_discount_syncs_to_linked_billing(client, seed, db_session):
    ha = auth(await login(client, "disc_ha@t.com"))
    _, case_id, plan_id = await create_patient_case_plan(client, ha, "Sync Pat", "+919800000003")
    billing_id = await link_billing(db_session, case_id, plan_id, total=1000)

    r = await client.put(f"/api/v1/treatment-plans/{plan_id}/discount", headers=ha, json={
        "discount_type": "PERCENTAGE", "discount_percent": 10, "discount_amount": 0,
        "discount_reason": "Sync",
    })
    assert r.status_code == 200, r.text
    assert r.json()["discount_amount"] == 100.0

    db_session.expire_all()
    billing = (await db_session.execute(select(Billing).where(Billing.id == billing_id))).scalar_one()
    assert billing.discount_amount == 100.0
    assert billing.discount_percent == 10.0
    assert billing.total_amount == 900.0
    assert billing.pending_amount == 900.0


async def test_billing_discount_syncs_to_treatment(client, seed, db_session):
    ha = auth(await login(client, "disc_ha@t.com"))
    _, case_id, plan_id = await create_patient_case_plan(client, ha, "Back Pat", "+919800000004")
    billing_id = await link_billing(db_session, case_id, plan_id, total=1000)

    r = await client.put(f"/api/v1/billings/{billing_id}/discount", headers=ha, json={
        "discount_type": "PERCENTAGE", "discount_percent": 15, "discount_amount": 0,
        "discount_reason": "From billing",
    })
    assert r.status_code == 200, r.text
    assert r.json()["discount_amount"] == 150.0

    db_session.expire_all()
    plan = (await db_session.execute(select(TreatmentPlan).where(TreatmentPlan.id == plan_id))).scalar_one()
    assert plan.discount_amount == 150.0
    assert plan.discount_percent == 15.0


async def test_tenant_isolation_and_timeline(client, seed, db_session):
    ha = auth(await login(client, "disc_ha@t.com"))
    hb = auth(await login(client, "disc_hb@t.com"))
    _, _, plan_id = await create_patient_case_plan(client, ha, "Tennant Pat", "+919800000005")

    r = await client.put(f"/api/v1/treatment-plans/{plan_id}/discount", headers=hb, json={
        "discount_type": "PERCENTAGE", "discount_percent": 5, "discount_amount": 0,
    })
    assert r.status_code == 403, "cross-hospital discount must be denied"

    r = await client.put(f"/api/v1/treatment-plans/{plan_id}/discount", headers=ha, json={
        "discount_type": "PERCENTAGE", "discount_percent": 5, "discount_amount": 0,
        "discount_reason": "Timeline check",
    })
    assert r.status_code == 200, r.text

    db_session.expire_all()
    rows = (await db_session.execute(
        select(PatientTimeline).where(PatientTimeline.action == "Discount Applied")
    )).scalars().all()
    assert rows, "Discount Applied timeline event must exist"
    assert all(row.module == "Treatments" for row in rows)


async def test_generic_billing_discount_allocates_to_plans_no_phantom_outstanding(client, seed, db_session):
    """Regression: a case-level (generic) billing discount must be allocated to the
    treatment plans so a fully-paid discounted invoice does not leave a phantom
    outstanding balance on a completed treatment plan (Tadikelapudi/Gangadhar bug)."""
    ha = auth(await login(client, "disc_ha@t.com"))
    r = await client.post("/api/v1/patients/", headers=ha, json={
        "full_name": "Phantom Pat", "phone": "+919800000006", "gender": "MALE",
    })
    assert r.status_code == 201, r.text
    patient_id = r.json()["id"]
    r = await client.post("/api/v1/cases/", headers=ha, json={
        "patient_id": patient_id, "chief_complaint": "Generic discount case",
    })
    assert r.status_code == 201, r.text
    case_id = r.json()["id"]

    costs = [3000.0, 1200.0, 3000.0]
    plan_ids = []
    for i, cost in enumerate(costs):
        r = await client.post("/api/v1/treatment-plans/", headers=ha, json={
            "case_id": case_id, "treatment_name": f"Tx {i}", "cost": cost, "total_sittings": 1,
        })
        assert r.status_code == 201, r.text
        plan_ids.append(r.json()["id"])

    r = await client.post("/api/v1/billings/", headers=ha, json={
        "case_id": case_id, "total_amount": sum(costs),
        "discount_type": "PERCENTAGE", "discount_percent": 5, "paid_amount": 6840.0,
    })
    assert r.status_code == 201, r.text
    assert r.json()["total_amount"] == 6840.0
    assert r.json()["payment_status"] == "PAID"

    db_session.expire_all()
    case = (await db_session.execute(select(Case).where(Case.id == case_id))).scalar_one()
    assert case.payment_status == "PAID", f"expected PAID got {case.payment_status}"
    assert case.outstanding_balance == 0.0, f"expected 0 got {case.outstanding_balance}"

    plans = (await db_session.execute(
        select(TreatmentPlan).where(TreatmentPlan.case_id == case_id).order_by(TreatmentPlan.created_at)
    )).scalars().all()
    for plan, cost in zip(plans, costs):
        expected_discount = round(cost * 0.05, 2)
        assert plan.discount_amount == expected_discount, f"{plan.treatment_name}: {plan.discount_amount} != {expected_discount}"
        assert plan.discount_percent == 5.0
        assert plan.original_amount == cost
        assert plan.paid_amount == round(cost - expected_discount, 2)
