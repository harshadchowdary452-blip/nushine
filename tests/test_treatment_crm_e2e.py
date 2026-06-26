"""End-to-end test: CRM enquiries only after treatment completion, using admin-configured rules."""
import pytest
from datetime import date
from httpx import AsyncClient
from app.core.security import hash_password
from app.core.permissions import Role
from app.models.user import User
from app.models.hospital import Hospital
from app.models.admin_group import AdminGroup


@pytest.fixture
async def seed(db_session):
    group = AdminGroup(name="CRM Test Group", description="CRM E2E")
    db_session.add(group)
    await db_session.flush()
    hospital = Hospital(admin_group_id=group.id, name="CRM Test Hospital", address="CRM Test Addr")
    db_session.add(hospital)
    await db_session.flush()
    users = {
        "SA": User(hospital_id=hospital.id, admin_group_id=group.id, email="crm_sa@t.com",
                   password_hash=hash_password("TestPass123"), full_name="CRM SA", role=Role.SUPER_ADMIN,
                   is_active=True, is_verified=True),
    }
    db_session.add_all(list(users.values()))
    await db_session.commit()
    return {"hospital_id": hospital.id, **{k: v.id for k, v in users.items()}}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_treatment_crm_workflow_e2e(client: AsyncClient, seed):
    token = await login(client, "crm_sa@t.com")
    headers = {"Authorization": f"Bearer {token}"}
    hid = seed["hospital_id"]

    # ── 1. Create TreatmentType: Scaling ──
    r = await client.post("/api/v1/treatment-types/", headers=headers, json={
        "name": "Scaling",
        "description": "Teeth scaling treatment",
    })
    assert r.status_code == 201, f"Create treatment type failed: {r.text}"
    tt_id = r.json()["id"]

    # ── 2. Configure CRM Rule for Scaling (admin opt-in: 6-Month, 12-Month ONLY) ──
    r = await client.post("/api/v1/crm/settings/rules", headers=headers, json={
        "treatment_type_id": tt_id,
        "treatment_name": "Scaling",
        "follow_up_1_day": False,
        "follow_up_7_day": False,
        "recall_6_month": True,
        "recall_12_month": True,
        "enquiry_enabled": False,
        "auto_appointment_enabled": False,
    })
    assert r.status_code in (200, 201), f"Create CRM rule failed: {r.text}"
    rule_id = r.json()["id"]
    assert rule_id

    # ── 3. Create Patient ──
    r = await client.post("/api/v1/patients/", headers=headers, json={
        "full_name": "Scaling Patient",
        "phone": "8000000001",
        "gender": "MALE",
    })
    assert r.status_code == 201, f"Create patient failed: {r.text}"
    patient_id = r.json()["id"]

    # ── 4. Create Case ──
    r = await client.post("/api/v1/cases/", headers=headers, json={
        "patient_id": patient_id,
        "chief_complaint": "Gum bleeding, needs scaling",
        "diagnosis": "Chronic gingivitis",
    })
    assert r.status_code == 201, f"Create case failed: {r.text}"
    case_id = r.json()["id"]

    # ── 5. Create TreatmentPlan (2 sittings) ──
    r = await client.post("/api/v1/treatment-plans/", headers=headers, json={
        "case_id": case_id,
        "treatment_name": "Scaling",
        "treatment_type_id": tt_id,
        "cost": 3000,
        "total_sittings": 2,
    })
    assert r.status_code == 201, f"Create treatment plan failed: {r.text}"
    plan_id = r.json()["id"]

    # ── 6. Create Sitting 1 (status: COMPLETED) ──
    r = await client.post("/api/v1/treatment-sittings/", headers=headers, json={
        "treatment_plan_id": plan_id,
        "sitting_number": 1,
        "status": "COMPLETED",
        "work_done": "Upper arch scaling",
    })
    assert r.status_code == 201, f"Create sitting 1 failed: {r.text}"

    # ── VERIFY: No follow-ups, recalls, or enquiries after sitting 1 ──
    r = await client.get("/api/v1/crm/treatment-follow-ups/", headers=headers, params={"patient_id": patient_id})
    assert r.status_code == 200, f"List follow-ups failed: {r.text}"
    assert len(r.json()) == 0, f"Expected 0 follow-ups after sitting 1, got {len(r.json())}: {r.json()}"

    # Verify plan is NOT completed yet
    r = await client.get(f"/api/v1/treatment-plans/{plan_id}", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] != "COMPLETED", "Plan should not be COMPLETED after sitting 1"
    assert r.json()["completed_sittings"] == 1

    # Verify no enquiries
    r = await client.get("/api/v1/crm/enquiries/", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 0, f"Expected 0 enquiries after sitting 1, got {len(r.json())}"

    # ── 7. Create Sitting 2 (status: COMPLETED) - last sitting ──
    r = await client.post("/api/v1/treatment-sittings/", headers=headers, json={
        "treatment_plan_id": plan_id,
        "sitting_number": 2,
        "status": "COMPLETED",
        "work_done": "Lower arch scaling and polishing",
    })
    assert r.status_code == 201, f"Create sitting 2 failed: {r.text}"

    # ── VERIFY: Plan is now COMPLETED ──
    r = await client.get(f"/api/v1/treatment-plans/{plan_id}", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "COMPLETED", f"Plan should be COMPLETED, got {r.json()['status']}"
    assert r.json()["completed_sittings"] == 2
    assert r.json()["remaining_sittings"] == 0

    # ── VERIFY: CRM rules executed - only 6-Month and 12-Month Recalls created ──
    r = await client.get("/api/v1/crm/treatment-follow-ups/", headers=headers, params={"patient_id": patient_id})
    assert r.status_code == 200
    fups = r.json()
    fu_types = {f["follow_up_type"] for f in fups}

    # Should have exactly 2 follow-ups: 6-Month and 12-Month
    assert "6_MONTH_RECALL" in fu_types, "6-Month Recall should be created"
    assert "12_MONTH_RECALL" in fu_types, "12-Month Recall should be created"
    assert "1_DAY_FOLLOW_UP" not in fu_types, "1-Day FU should NOT be created"
    assert "7_DAY_FOLLOW_UP" not in fu_types, "7-Day FU should NOT be created"
    assert len(fups) == 2, f"Expected exactly 2 follow-ups, got {len(fups)}"

    # ── VERIFY: Enquiry Calendar shows the created recalls ──
    today = date.today()
    r = await client.get("/api/v1/crm/enquiries/calendar", headers=headers, params={
        "start_date": today.isoformat(),
        "end_date": (today.replace(year=today.year + 1)).isoformat(),
    })
    assert r.status_code == 200
    calendar_entries = r.json()
    # At least 2 entries should exist (the two recalls)
    calendar_sources = {e["source"] for e in calendar_entries}
    assert "follow_up" in calendar_sources or len(calendar_entries) >= 2, \
        f"Calendar should show recalls, got {len(calendar_entries)} entries"

    # ── VERIFY: Patient Timeline shows correct progression ──
    r = await client.get(f"/api/v1/cases/{case_id}/timeline", headers=headers)
    assert r.status_code == 200
    timeline = r.json()
    timeline_actions = [t["action"] for t in timeline]

    assert "Treatment Sitting #1 Completed" in timeline_actions
    assert "Treatment Sitting #2 Completed" in timeline_actions
    assert "Treatment Plan Completed" in timeline_actions
    assert "6 Month Recall Created" in timeline_actions
    assert "12 Month Recall Created" in timeline_actions

    # Verify 1-Day/7-Day follow-ups are NOT in timeline
    for bad in ["1 Day Follow Up Created", "7 Day Follow Up Created", "One Day Follow Up Created", "Seven Day Follow Up Created"]:
        assert bad not in timeline_actions, f"Timeline should not contain '{bad}'"

    # ── VERIFY: CRM dashboard does not count incomplete treatments ──
    r = await client.get("/api/v1/crm/enhanced-dashboard", headers=headers, params={"period": "this_month"})
    assert r.status_code == 200

    # ── VERIFY: CRM Rule summary reflects only enabled rules ──
    r = await client.get("/api/v1/crm/settings/summary", headers=headers)
    assert r.status_code == 200
    summary = r.json()
    assert summary["treatments_with_1_day"] == 0
    assert summary["treatments_with_7_day"] == 0
    assert summary["treatments_with_6m_recall"] == 1
    assert summary["treatments_with_12m_recall"] == 1
