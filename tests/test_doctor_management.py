"""Tests for doctor management: soft delete and per-hospital activation."""
import pytest
from datetime import datetime, timezone

from httpx import AsyncClient

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.doctor_hospital import DoctorHospital
from app.models.hospital import Hospital
from app.models.user import User


@pytest.fixture
async def seed(db_session):
    g1 = AdminGroup(name="Group One", description="")
    g2 = AdminGroup(name="Group Two", description="")
    db_session.add_all([g1, g2])
    await db_session.flush()
    ha = Hospital(admin_group_id=g1.id, name="Hosp A")
    hb = Hospital(admin_group_id=g1.id, name="Hosp B")
    hz = Hospital(admin_group_id=g2.id, name="Hosp Z")
    db_session.add_all([ha, hb, hz])
    await db_session.flush()

    def _user(email, name, role, hospital=None, group=None):
        return User(email=email, password_hash=hash_password("TestPass123"), full_name=name,
                    role=role, hospital_id=hospital.id if hospital else None,
                    admin_group_id=group.id if group else None,
                    is_active=True, is_verified=True)

    users = {
        "SA": _user("mgt_sa@t.com", "SA", Role.SUPER_ADMIN),
        "GA": _user("mgt_ga@t.com", "GA", Role.GROUP_ADMIN, group=g1),
        "GA2": _user("mgt_ga2@t.com", "GA2", Role.GROUP_ADMIN, group=g2),
        "HA": _user("mgt_ha@t.com", "HA", Role.HOSPITAL_ADMIN, hospital=ha, group=g1),
        "DR1": _user("mgt_dr1@t.com", "Dr One", Role.DOCTOR, hospital=ha, group=g1),
        "DR2": _user("mgt_dr2@t.com", "Dr Two", Role.DOCTOR, hospital=hb, group=g1),
        "DRZ": _user("mgt_drz@t.com", "Dr Zed", Role.DOCTOR, hospital=hz, group=g2),
    }
    db_session.add_all(list(users.values()))
    await db_session.flush()
    # Per-hospital memberships (primary hospital only) for DR1 and DR2.
    db_session.add_all([
        DoctorHospital(user_id=users["DR1"].id, hospital_id=ha.id, is_active=True),
        DoctorHospital(user_id=users["DR2"].id, hospital_id=hb.id, is_active=True),
        DoctorHospital(user_id=users["DRZ"].id, hospital_id=hz.id, is_active=True),
    ])
    await db_session.commit()
    return {"g1": g1.id, "g2": g2.id, "HA_ID": ha.id, "HB_ID": hb.id,
            **{k: v.id for k, v in users.items()}}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


async def _user_after(db_session, user_id):
    return await db_session.get(User, user_id)


@pytest.mark.asyncio
async def test_group_admin_soft_deletes_doctor(client: AsyncClient, seed, db_session):
    token = await login(client, "mgt_ga@t.com")
    r = await client.delete(f"/api/v1/doctors/{seed['DR2']}",
                            headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    dr2 = await _user_after(db_session, seed["DR2"])
    assert dr2.is_active is False
    assert dr2.is_deleted is True
    assert dr2.deleted_at is not None
    # Repeat delete -> gone.
    r = await client.delete(f"/api/v1/doctors/{seed['DR2']}",
                            headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 404
    # Deleted doctor no longer appears in the doctor list.
    r = await client.get("/api/v1/doctors/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    ids = {d["id"] for d in r.json()}
    assert seed["DR2"] not in ids


@pytest.mark.asyncio
async def test_group_admin_cannot_delete_outside_group(client: AsyncClient, seed):
    token = await login(client, "mgt_ga@t.com")
    r = await client.delete(f"/api/v1/doctors/{seed['DRZ']}",
                            headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_doctor_cannot_delete(client: AsyncClient, seed):
    token = await login(client, "mgt_dr1@t.com")
    r = await client.delete(f"/api/v1/doctors/{seed['DR2']}",
                            headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_create_doctor_creates_membership(client: AsyncClient, seed, db_session):
    token = await login(client, "mgt_sa@t.com")
    r = await client.post("/api/v1/doctors/", headers={"Authorization": f"Bearer {token}"}, json={
        "email": "mgt_new@t.com", "password": "TestPass123", "full_name": "Dr New",
        "hospital_id": seed["HA_ID"], "admin_group_id": seed["g1"],
    })
    assert r.status_code == 201, r.text
    new_id = r.json()["id"]
    member = (await db_session.execute(
        DoctorHospital.__table__.select().where(DoctorHospital.user_id == new_id)
    )).first()
    assert member is not None
    assert member.is_active is True


@pytest.mark.asyncio
async def test_per_hospital_deactivate_hides_doctor_in_scope(client: AsyncClient, seed):
    token = await login(client, "mgt_ga@t.com")
    # DR1 is active at hospital A -> appears under hospital A context.
    r = await client.get("/api/v1/doctor-performance",
                         headers={"Authorization": f"Bearer {token}", "X-Hospital-ID": seed["HA_ID"]})
    assert r.status_code == 200
    assert seed["DR1"] in {d["id"] for d in r.json()["doctors"]}
    assert seed["DR2"] not in {d["id"] for d in r.json()["doctors"]}

    # Deactivate DR1 at hospital A -> disappears from hospital A context.
    r = await client.post(f"/api/v1/doctors/{seed['DR1']}/hospitals/{seed['HA_ID']}/deactivate",
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    r = await client.get("/api/v1/doctor-performance",
                         headers={"Authorization": f"Bearer {token}", "X-Hospital-ID": seed["HA_ID"]})
    assert r.status_code == 200
    assert {d["id"] for d in r.json()["doctors"]} == set()

    # Reactivate -> DR1 is visible again.
    r = await client.post(f"/api/v1/doctors/{seed['DR1']}/hospitals/{seed['HA_ID']}/activate",
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    r = await client.get("/api/v1/doctor-performance",
                         headers={"Authorization": f"Bearer {token}", "X-Hospital-ID": seed["HA_ID"]})
    assert r.status_code == 200
    assert seed["DR1"] in {d["id"] for d in r.json()["doctors"]}
