"""Laboratory batch send tests:
- candidates include ALL WAITING_LAB treatments, whether or not a lab case
  exists and regardless of its status (empty-list fix)
- batch-send groups multiple treatments into one WhatsApp message, marks them SENT,
  records the message + response on each lab case and keeps the treatment WAITING_LAB
- RESENT moves a resumed treatment back to WAITING_LAB
"""
import pytest
from datetime import date
from httpx import AsyncClient

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User


@pytest.fixture
async def seed(db_session):
    g1 = AdminGroup(name="Lab Batch Group", description="")
    db_session.add(g1)
    await db_session.flush()
    ha = Hospital(admin_group_id=g1.id, name="Batch Hosp A")
    db_session.add(ha)
    await db_session.flush()

    def _user(email, name, role, hospital=None, group=None):
        return User(email=email, password_hash=hash_password("TestPass123"), full_name=name,
                    role=role, hospital_id=hospital.id if hospital else None,
                    admin_group_id=group.id if group else None,
                    is_active=True, is_verified=True)

    users = {
        "HA": _user("batch_ha@t.com", "Batch HA", Role.HOSPITAL_ADMIN, hospital=ha, group=g1),
        "DR": _user("batch_dr@t.com", "Batch Dr", Role.DOCTOR, hospital=ha, group=g1),
    }
    db_session.add_all(list(users.values()))
    await db_session.commit()
    return {"HA_ID": ha.id, **{k: v.id for k, v in users.items()}}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def create_patient_case_plan(client, headers, name, phone, treatment):
    r = await client.post("/api/v1/patients/", headers=headers, json={
        "full_name": name, "phone": phone, "gender": "MALE",
    })
    assert r.status_code == 201, f"Create patient failed: {r.text}"
    patient_id = r.json()["id"]
    r = await client.post("/api/v1/cases/", headers=headers, json={
        "patient_id": patient_id, "chief_complaint": "Needs lab work",
    })
    assert r.status_code == 201, f"Create case failed: {r.text}"
    case_id = r.json()["id"]
    r = await client.post("/api/v1/treatment-plans/", headers=headers, json={
        "case_id": case_id, "treatment_name": treatment, "cost": 1000, "total_sittings": 2,
    })
    assert r.status_code == 201, f"Create plan failed: {r.text}"
    return patient_id, case_id, r.json()["id"]


async def set_waiting_lab(client, headers, plan_id, **body):
    r = await client.post(f"/api/v1/treatment-plans/{plan_id}/set-waiting?waiting_type=WAITING_LAB",
                          headers=headers, json=body)
    assert r.status_code == 200, f"set-waiting failed: {r.text}"
    return r


@pytest.mark.asyncio
async def test_candidates_include_all_waiting_lab_treatments(client: AsyncClient, seed):
    ha = await login(client, "batch_ha@t.com")
    dr = await login(client, "batch_dr@t.com")
    _, _, plan_pending = await create_patient_case_plan(client, auth(ha), "Cand Pending", "8200000101", "Crown")
    await set_waiting_lab(client, auth(dr), plan_pending, lab_name="CandLab", lab_order_number="PO-C1")
    _, _, plan_sent = await create_patient_case_plan(client, auth(ha), "Cand Sent", "8200000102", "Bridge")
    await set_waiting_lab(client, auth(dr), plan_sent, lab_name="CandLab", lab_order_number="PO-C2",
                          lab_sent_date="2026-08-01")

    r = await client.get("/api/v1/lab-cases/candidates", headers=auth(dr))
    assert r.status_code == 200, r.text
    ids = [c["treatment_plan_id"] for c in r.json()]
    assert plan_pending in ids, "WAITING_LAB treatment with a PENDING lab case must appear in candidates"
    assert plan_sent in ids, "WAITING_LAB treatment with a SENT lab case must appear in candidates"
    by_id = {c["treatment_plan_id"]: c for c in r.json()}
    assert by_id[plan_pending]["lab_case_id"] is not None
    assert by_id[plan_sent]["lab_case_id"] is not None


@pytest.mark.asyncio
async def test_batch_send_groups_and_marks_sent(client: AsyncClient, seed, db_session):
    ha = await login(client, "batch_ha@t.com")
    dr = await login(client, "batch_dr@t.com")

    r = await client.post("/api/v1/laboratories/", headers=auth(ha), json={
        "name": "BatchLab", "whatsapp_number": "9876543210", "phone": "9876543210",
    })
    assert r.status_code == 201, r.text
    lab_id = r.json()["id"]

    plans = []
    for i in range(3):
        _, _, plan = await create_patient_case_plan(
            client, auth(ha), f"Batch Patient {i}", f"820000020{i}", f"Bridge {i}")
        await set_waiting_lab(client, auth(dr), plan, lab_name="BatchLab", lab_order_number=f"PO-{i}")
        plans.append(plan)

    r = await client.post("/api/v1/lab-cases/batch-send", headers=auth(dr), json={
        "treatment_plan_ids": plans,
        "laboratory_id": lab_id,
        "due_date": "2026-08-20",
    })
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["success"] is True
    assert result["deep_link"]
    assert len(result["lab_case_ids"]) == 3
    assert "BatchLab Team" in result["message"]
    assert "Expected return date: 2026-08-20" in result["message"]
    assert "Batch Patient 0" in result["message"]

    r = await client.get("/api/v1/lab-cases/", headers=auth(dr))
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 3, "Still one lab case per treatment"
    items = r.json()["items"]
    assert all(lc["lab_status"] == "SENT" for lc in items), [lc["lab_status"] for lc in items]
    assert all(lc["sent_date"] == date.today().isoformat() for lc in items)
    assert all(lc["laboratory_id"] == lab_id for lc in items)

    for lc in items:
        ev = await client.get(f"/api/v1/lab-cases/{lc['id']}/events", headers=auth(dr))
        whatsapp = [e for e in ev.json() if e["event_type"] == "WHATSAPP"]
        assert len(whatsapp) == 1, "Exactly one WhatsApp event recorded per lab case"
        assert "[Response]" in whatsapp[0]["note"]
        assert '"success": true' in whatsapp[0]["note"]

    for plan in plans:
        r = await client.get(f"/api/v1/treatment-plans/{plan}", headers=auth(dr))
        assert r.json()["status"] == "WAITING_LAB", "Treatment stays WAITING_LAB after batch send"


@pytest.mark.asyncio
async def test_resent_returns_treatment_to_waiting_lab(client: AsyncClient, seed):
    ha = await login(client, "batch_ha@t.com")
    dr = await login(client, "batch_dr@t.com")
    _, _, plan = await create_patient_case_plan(client, auth(ha), "Resend Patient", "8200000301", "Denture")
    await set_waiting_lab(client, auth(dr), plan, lab_name="ResendLab")

    r = await client.get(f"/api/v1/lab-cases/by-treatment/{plan}", headers=auth(dr))
    lab_case_id = r.json()["id"]

    # Received → treatment resumes to IN_PROGRESS.
    r = await client.post(f"/api/v1/lab-cases/{lab_case_id}/status", headers=auth(dr),
                          json={"status": "RECEIVED"})
    assert r.status_code == 200, r.text
    assert r.json()["lab_status"] == "RECEIVED"
    assert r.json()["returned_date"] == date.today().isoformat()
    r = await client.get(f"/api/v1/treatment-plans/{plan}", headers=auth(dr))
    assert r.json()["status"] == "IN_PROGRESS"

    # Re-sent → treatment goes back to WAITING_LAB.
    r = await client.post(f"/api/v1/lab-cases/{lab_case_id}/status", headers=auth(dr),
                          json={"status": "RESENT"})
    assert r.status_code == 200, r.text
    assert r.json()["lab_status"] == "RESENT"
    assert r.json()["sent_date"] == date.today().isoformat()
    r = await client.get(f"/api/v1/treatment-plans/{plan}", headers=auth(dr))
    assert r.json()["status"] == "WAITING_LAB", "RESENT must put the treatment back to WAITING_LAB"


@pytest.mark.asyncio
async def test_whatsapp_single_send_marks_pending_sent_and_records_response(client: AsyncClient, seed):
    ha = await login(client, "batch_ha@t.com")
    dr = await login(client, "batch_dr@t.com")
    _, _, plan = await create_patient_case_plan(client, auth(ha), "Wha Patient", "8200000401", "Veneer")
    await set_waiting_lab(client, auth(dr), plan, lab_name="WhaLab", lab_order_number="PO-W1")

    r = await client.get(f"/api/v1/lab-cases/by-treatment/{plan}", headers=auth(dr))
    lab_case_id = r.json()["id"]
    assert r.json()["lab_status"] == "PENDING"

    r = await client.post(f"/api/v1/lab-cases/{lab_case_id}/whatsapp", headers=auth(dr),
                          json={"message": "Please process veneer", "phone": "9876501234"})
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True

    r = await client.get(f"/api/v1/lab-cases/{lab_case_id}", headers=auth(dr))
    assert r.json()["lab_status"] == "SENT", "Sending WhatsApp to a PENDING case promotes it to SENT"
    assert r.json()["sent_date"] == date.today().isoformat()

    r = await client.get(f"/api/v1/lab-cases/{lab_case_id}/events", headers=auth(dr))
    whatsapp = [e for e in r.json() if e["event_type"] == "WHATSAPP"]
    assert len(whatsapp) == 1
    assert "Please process veneer" in whatsapp[0]["note"]
    assert "[Response]" in whatsapp[0]["note"]
