"""Simulate frontend flow: create records as each role, then list them."""
import pytest
from httpx import AsyncClient
from app.core.security import hash_password
from app.core.permissions import Role
from app.models.user import User
from app.models.hospital import Hospital
from app.models.admin_group import AdminGroup


@pytest.fixture
async def seed(db_session):
    group = AdminGroup(name="Test Group", description="Test")
    db_session.add(group)
    await db_session.flush()
    hospital = Hospital(admin_group_id=group.id, name="Test Hospital", address="Test")
    db_session.add(hospital)
    await db_session.flush()
    users = {
        "SA": User(hospital_id=hospital.id, admin_group_id=group.id, email="sa@t.com",
                   password_hash=hash_password("TestPass123"), full_name="S Adm", role=Role.SUPER_ADMIN,
                   is_active=True, is_verified=True),
        "GA": User(hospital_id=hospital.id, admin_group_id=group.id, email="ga@t.com",
                   password_hash=hash_password("TestPass123"), full_name="G Adm", role=Role.GROUP_ADMIN,
                   is_active=True, is_verified=True),
        "HA": User(hospital_id=hospital.id, admin_group_id=group.id, email="ha@t.com",
                   password_hash=hash_password("TestPass123"), full_name="H Adm", role=Role.HOSPITAL_ADMIN,
                   is_active=True, is_verified=True),
        "DR": User(hospital_id=hospital.id, admin_group_id=group.id, email="dr@t.com",
                   password_hash=hash_password("TestPass123"), full_name="Dr T", role=Role.DOCTOR,
                   is_active=True, is_verified=True),
    }
    db_session.add_all(list(users.values()))
    await db_session.commit()
    return {"hospital_id": hospital.id, **{k: v.id for k, v in users.items()}}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_hospital_admin_and_doctor_create_and_list(client: AsyncClient, seed):
    # Create shared reference data as SUPER_ADMIN
    sa_token = await login(client, "sa@t.com")
    sa_headers = {"Authorization": f"Bearer {sa_token}"}

    r = await client.post("/api/v1/patients/", headers=sa_headers,
                          json={"full_name": "Ref Pat", "phone": "8000000000", "gender": "MALE"})
    assert r.status_code == 201
    pat_id = r.json()["id"]

    r = await client.post("/api/v1/doctors/", headers=sa_headers,
                          json={"email": "refdoc@t.com", "password": "TestPass123",
                                "full_name": "Dr Ref", "phone": "7000000000",
                                "specialization": "ORTHODONTICS"})
    assert r.status_code == 201
    doc_id = r.json()["id"]

    r = await client.post("/api/v1/cases/", headers=sa_headers,
                          json={"patient_id": pat_id, "chief_complaint": "Ref case"})
    assert r.status_code == 201
    case_id = r.json()["id"]

    # Extract dr@t.com's own user_id for doctor-scoped testing
    doctor_self_id = seed["DR"]

    for role_key, role_label in [("GA", "GROUP_ADMIN"), ("HA", "HOSPITAL_ADMIN"), ("DR", "DOCTOR")]:
        token = await login(client, f"{role_key.lower()}@t.com")
        headers = {"Authorization": f"Bearer {token}"}
        print(f"\n=== {role_label} ===")

        now = f"{role_key}"
        # DOCTOR uses their own user_id as doctor_id so list filters match
        effective_doc_id = doc_id if role_key != "DR" else doctor_self_id

        # --- APPOINTMENT ---
        r = await client.post("/api/v1/appointments/", headers=headers, json={
            "patient_id": pat_id, "doctor_id": effective_doc_id,
            "appointment_date": "2026-07-01", "appointment_time": "09:00",
            "notes": f"appt_{now}",
        })
        ok = r.status_code == 201
        print(f"  CREATE appointment: [{'OK' if ok else 'FAIL'}] {r.status_code} {r.text[:100] if not ok else ''}")
        if ok:
            r2 = await client.get("/api/v1/appointments/", headers=headers)
            listed = r2.json()
            items = listed if isinstance(listed, list) else listed.get("items", [])
            found = any(f"appt_{now}" in str(i) for i in items)
            print(f"  LIST  appointment:  count={len(items)} found_new={found}")

        # --- TREATMENT PLAN ---
        r = await client.post("/api/v1/treatment-plans/", headers=headers, json={
            "case_id": case_id, "treatment_name": f"TP_{now}", "cost": 150,
        })
        ok = r.status_code == 201
        print(f"  CREATE treatment:   [{'OK' if ok else 'FAIL'}] {r.status_code} {r.text[:100] if not ok else ''}")
        if ok:
            r2 = await client.get("/api/v1/treatment-plans/", headers=headers)
            listed = r2.json()
            items = listed if isinstance(listed, list) else listed.get("items", [])
            found = any(f"TP_{now}" in str(i) for i in items)
            print(f"  LIST  treatment:    count={len(items)} found_new={found}")

        # --- BILLING ---
        r = await client.post("/api/v1/billings/", headers=headers, json={
            "case_id": case_id, "total_amount": 300, "paid_amount": 100,
            "payment_method": "CASH", "notes": f"bill_{now}",
        })
        ok = r.status_code == 201
        print(f"  CREATE billing:     [{'OK' if ok else 'FAIL'}] {r.status_code} {r.text[:100] if not ok else ''}")
        if ok:
            r2 = await client.get("/api/v1/billings/", headers=headers)
            listed = r2.json()
            items = listed if isinstance(listed, list) else listed.get("items", [])
            found = any(f"bill_{now}" in str(i) for i in items)
            print(f"  LIST  billing:      count={len(items)} found_new={found}")

        # --- CASE ---
        r = await client.post("/api/v1/cases/", headers=headers, json={
            "patient_id": pat_id, "doctor_id": effective_doc_id,
            "chief_complaint": f"complaint_{now}",
        })
        ok = r.status_code == 201
        print(f"  CREATE case:        [{'OK' if ok else 'FAIL'}] {r.status_code} {r.text[:100] if not ok else ''}")
        if ok:
            r2 = await client.get("/api/v1/cases/", headers=headers)
            listed = r2.json()
            items = listed if isinstance(listed, list) else listed.get("items", [])
            found = any(f"complaint_{now}" in str(i) for i in items)
            print(f"  LIST  case:         count={len(items)} found_new={found}")

        # --- CONSULTANT ---
        r = await client.post("/api/v1/consultants/", headers=headers, json={
            "full_name": f"Cons_{now}", "phone": "6000000000",
            "specialization": "ENDODONTICS",
        })
        ok = r.status_code == 201
        print(f"  CREATE consultant:  [{'OK' if ok else 'FAIL'}] {r.status_code} {r.text[:100] if not ok else ''}")
        if ok:
            r2 = await client.get("/api/v1/consultants/", headers=headers)
            listed = r2.json()
            items = listed if isinstance(listed, list) else listed.get("items", [])
            found = any(f"Cons_{now}" in str(i) for i in items)
            print(f"  LIST  consultant:   count={len(items)} found_new={found}")
