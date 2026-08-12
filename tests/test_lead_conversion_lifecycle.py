"""Lead -> Patient conversion lifecycle tests.

Guards the data-integrity contract around conversion:
  * conversion is idempotent and NEVER deletes the original lead
  * converted leads cannot be deleted or have their status changed (no de-conversion)
  * converted_at / converted_by are recorded on the lead
  * converting an existing patient (same phone + hospital) reuses it - no duplicates
  * CONTACTED is only reached through genuine contact activity (communication/call)
  * lead_score is server-managed and cannot be set by clients
"""
import pytest
from datetime import datetime, timezone

from sqlalchemy import func, select

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.lead import Lead
from app.models.patient import Patient
from app.models.user import User

from tests.conftest import test_async_session_factory


@pytest.fixture
async def seed(db_session):
    group = AdminGroup(name="Lead Conv Group", description="Conversion lifecycle")
    db_session.add(group)
    await db_session.flush()
    hospital = Hospital(admin_group_id=group.id, name="Conversion Hosp")
    db_session.add(hospital)
    await db_session.flush()
    admin = User(email="conv_ha@t.com", password_hash=hash_password("TestPass123"),
                 full_name="Conv Admin", role=Role.HOSPITAL_ADMIN, hospital_id=hospital.id,
                 admin_group_id=group.id, is_active=True, is_verified=True)
    db_session.add(admin)
    await db_session.commit()
    return {"HOSPITAL_ID": hospital.id, "ADMIN_ID": admin.id}


async def login(client, email="conv_ha@t.com"):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _create_lead(client, token, hospital_id, mobile="9000000001", **extra):
    payload = {
        "lead_name": "Conversion Lead",
        "mobile": mobile,
        "email": "conv@t.com",
        "source": "GOOGLE_SEARCH",
        "hospital_id": hospital_id,
        **extra,
    }
    r = await client.post("/api/v1/leads/", json=payload, headers=auth(token))
    assert r.status_code == 201, f"Create lead failed: {r.text}"
    return r.json()


async def _convert(client, token, lead_id):
    r = await client.post(f"/api/v1/leads/{lead_id}/convert", json={}, headers=auth(token))
    assert r.status_code == 200, f"Convert failed: {r.text}"
    return r.json()


async def _lead_count(db):
    return (await db.execute(select(func.count()).select_from(Lead))).scalar() or 0


async def _patient_count(db):
    return (await db.execute(select(func.count()).select_from(Patient))).scalar() or 0


async def _get_lead(db, lead_id):
    return await db.get(Lead, lead_id)


@pytest.mark.asyncio
async def test_convert_is_idempotent_and_never_deletes_lead(client, seed, db_session):
    token = await login(client)
    lead = await _create_lead(client, token, seed["HOSPITAL_ID"], mobile="9000000001")

    res = await _convert(client, token, lead["id"])
    assert res["existing_patient"] is False
    patient_id = res["patient_id"]

    # Lead is preserved and marked CONVERTED with the patient link intact.
    got = (await client.get(f"/api/v1/leads/{lead['id']}", headers=auth(token))).json()
    assert got["status"] == "CONVERTED"
    assert got["converted_patient_id"] == patient_id

    # Second conversion is rejected (idempotent) and creates nothing new.
    r2 = await client.post(f"/api/v1/leads/{lead['id']}/convert", json={}, headers=auth(token))
    assert r2.status_code == 400
    assert "already converted" in r2.json()["detail"].lower()

    assert await _lead_count(db_session) == 1
    assert await _patient_count(db_session) == 1


@pytest.mark.asyncio
async def test_converted_lead_cannot_be_deleted(client, seed):
    token = await login(client)
    lead = await _create_lead(client, token, seed["HOSPITAL_ID"], mobile="9000000002")
    await _convert(client, token, lead["id"])

    r = await client.delete(f"/api/v1/leads/{lead['id']}", headers=auth(token))
    assert r.status_code == 400
    assert "cannot be deleted" in r.json()["detail"].lower()

    got = (await client.get(f"/api/v1/leads/{lead['id']}", headers=auth(token)))
    assert got.status_code == 200
    assert got.json()["status"] == "CONVERTED"


@pytest.mark.asyncio
async def test_converted_lead_status_is_protected(client, seed):
    token = await login(client)
    lead = await _create_lead(client, token, seed["HOSPITAL_ID"], mobile="9000000003")
    await _convert(client, token, lead["id"])

    r = await client.put(f"/api/v1/leads/{lead['id']}/status", json={"status": "LOST"},
                         headers=auth(token))
    assert r.status_code == 400

    r2 = await client.put(f"/api/v1/leads/{lead['id']}", json={"status": "INTERESTED"},
                          headers=auth(token))
    assert r2.status_code == 400

    got = (await client.get(f"/api/v1/leads/{lead['id']}", headers=auth(token))).json()
    assert got["status"] == "CONVERTED"


@pytest.mark.asyncio
async def test_convert_records_converted_at_and_converted_by(client, seed, db_session):
    token = await login(client)
    lead = await _create_lead(client, token, seed["HOSPITAL_ID"], mobile="9000000004")
    await _convert(client, token, lead["id"])

    stored = await _get_lead(db_session, lead["id"])
    assert stored.converted_at is not None
    assert stored.converted_at <= datetime.now(timezone.utc)
    assert stored.converted_by == seed["ADMIN_ID"]


@pytest.mark.asyncio
async def test_convert_reuses_existing_patient_no_duplicate(client, seed, db_session):
    token = await login(client)
    mobile = "9000000005"
    # A patient already exists for this phone + hospital.
    existing = Patient(hospital_id=seed["HOSPITAL_ID"], full_name="Existing Patient", phone=mobile)
    db_session.add(existing)
    await db_session.commit()

    lead = await _create_lead(client, token, seed["HOSPITAL_ID"], mobile=mobile)
    res = await _convert(client, token, lead["id"])

    assert res["existing_patient"] is True
    assert res["patient_id"] == existing.id
    assert await _patient_count(db_session) == 1


@pytest.mark.asyncio
async def test_contact_activity_advances_new_to_contacted(client, seed):
    token = await login(client)

    # A recorded communication is genuine contact activity.
    lead_a = await _create_lead(client, token, seed["HOSPITAL_ID"], mobile="9000000006")
    r = await client.post(
        f"/api/v1/leads/{lead_a['id']}/communications",
        json={"channel": "NOTE", "message": "Initial note - first contact"},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text
    got_a = (await client.get(f"/api/v1/leads/{lead_a['id']}", headers=auth(token))).json()
    assert got_a["status"] == "CONTACTED"
    assert got_a["last_contacted_at"] is not None

    # A recorded call is genuine contact activity.
    lead_b = await _create_lead(client, token, seed["HOSPITAL_ID"], mobile="9000000007")
    r2 = await client.post(
        f"/api/v1/leads/{lead_b['id']}/calls",
        json={"outcome": "NO_ANSWER", "notes": "Rang twice"},
        headers=auth(token),
    )
    assert r2.status_code == 201, r2.text
    got_b = (await client.get(f"/api/v1/leads/{lead_b['id']}", headers=auth(token))).json()
    assert got_b["status"] == "CONTACTED"


@pytest.mark.asyncio
async def test_lead_score_is_server_managed(client, seed, db_session):
    token = await login(client)
    # Client cannot force a score on create; the server computes it.
    lead = await _create_lead(client, token, seed["HOSPITAL_ID"], mobile="9000000008", lead_score=99)
    assert lead["lead_score"] != 99

    # Client cannot change the score on update either.
    before = lead["lead_score"]
    r = await client.put(f"/api/v1/leads/{lead['id']}", json={"lead_score": 1},
                         headers=auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["lead_score"] == before

    stored = await _get_lead(db_session, lead["id"])
    assert stored.lead_score == before
