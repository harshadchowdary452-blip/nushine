import asyncio, sys
sys.path.insert(0, ".")

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.database import Base, get_db
from app.main import app
from app.core.security import hash_password
from app.models.user import User
from app.core.permissions import Role


async def test_full_workflow():
    engine = create_async_engine("sqlite+aiosqlite://", echo=False, connect_args={"check_same_thread": False})
    test_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=True) as client:
        # ── Seed SUPER_ADMIN ──
        async with test_session_factory() as db:
            sa = User(
                email="superadmin@dental.com",
                password_hash=hash_password("SuperAdmin@123"),
                full_name="Super Admin",
                role=Role.SUPER_ADMIN,
                is_verified=True,
            )
            db.add(sa)
            await db.commit()
            print(f"  Seeded super admin: {sa.id}")

        # ── 1. SUPER_ADMIN login ──
        resp = await client.post("/api/v1/auth/login", json={"email": "superadmin@dental.com", "password": "SuperAdmin@123"})
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        super_token = resp.json()["access_token"]
        super_headers = {"Authorization": f"Bearer {super_token}"}

        # ── 2. SUPER_ADMIN creates GROUP ──
        resp = await client.post("/api/v1/admin-groups/", json={"name": "Test Group"}, headers=super_headers)
        assert resp.status_code == 201, f"Group creation failed: {resp.text}"
        group_id = resp.json()["id"]
        print(f"  GROUP created: {group_id}")

        # ── 3. SUPER_ADMIN creates GROUP_ADMIN (without hospital_id) ──
        resp = await client.post(f"/api/v1/admin-groups/{group_id}/admins", json={
            "email": "groupadmin@test.com",
            "password": "Test@1234",
            "full_name": "Group Admin",
        }, headers=super_headers)
        assert resp.status_code == 201, f"Group admin creation failed: {resp.text}"
        group_admin_id = resp.json()["id"]
        print(f"  GROUP_ADMIN created: {group_admin_id}")

        # ── 4. GROUP_ADMIN login ──
        resp = await client.post("/api/v1/auth/login", json={"email": "groupadmin@test.com", "password": "Test@1234"})
        assert resp.status_code == 200, f"Group admin login failed: {resp.text}"
        ga_data = resp.json()
        ga_token = ga_data["access_token"]
        ga_headers = {"Authorization": f"Bearer {ga_token}"}
        print(f"  GROUP_ADMIN logged in, JWT hospital_id: {ga_data['user']['hospital_id']}")

        # ── 5. GROUP_ADMIN creates HOSPITAL ──
        resp = await client.post("/api/v1/hospitals/", json={
            "name": "Test Hospital",
            "address": "123 Main St",
            "phone": "555-0100",
            "admin_group_id": group_id,
        }, headers=ga_headers)
        assert resp.status_code == 201, f"Hospital creation failed: {resp.text}"
        hospital_id = resp.json()["id"]
        print(f"  HOSPITAL created: {hospital_id}")

        # ── 6. GROUP_ADMIN creates HOSPITAL_ADMIN ──
        resp = await client.post(f"/api/v1/hospitals/{hospital_id}/admins", json={
            "email": "hospitaladmin@test.com",
            "password": "Test@1234",
            "full_name": "Hospital Admin",
        }, headers=ga_headers)
        assert resp.status_code == 201, f"Hospital admin creation failed: {resp.text}"
        ha_id = resp.json()["id"]
        print(f"  HOSPITAL_ADMIN created: {ha_id}")

        # ── 7. HOSPITAL_ADMIN login ──
        resp = await client.post("/api/v1/auth/login", json={"email": "hospitaladmin@test.com", "password": "Test@1234"})
        assert resp.status_code == 200, f"Hospital admin login failed: {resp.text}"
        ha_data = resp.json()
        ha_token = ha_data["access_token"]
        ha_headers = {"Authorization": f"Bearer {ha_token}"}
        print(f"  HOSPITAL_ADMIN logged in, JWT hospital_id: {ha_data['user']['hospital_id']}")

        # ── 8. HOSPITAL_ADMIN creates DOCTOR (without hospital_id - auto-set from JWT) ──
        resp = await client.post("/api/v1/doctors/", json={
            "email": "doctor@test.com",
            "password": "Test@1234",
            "full_name": "Dr. Test Dentist",
            "specialization": "Orthodontics",
        }, headers=ha_headers)
        assert resp.status_code == 201, f"Doctor creation failed: {resp.text}"
        doctor_id = resp.json()["id"]
        print(f"  DOCTOR created: {doctor_id}")

        # ── 9. DOCTOR login ──
        resp = await client.post("/api/v1/auth/login", json={"email": "doctor@test.com", "password": "Test@1234"})
        assert resp.status_code == 200, f"Doctor login failed: {resp.text}"
        doc_data = resp.json()
        doc_token = doc_data["access_token"]
        doc_headers = {"Authorization": f"Bearer {doc_token}"}
        print(f"  DOCTOR logged in, JWT hospital_id: {doc_data['user']['hospital_id']}")

        # ── 10. DOCTOR creates PATIENT (without hospital_id, without doctor_id) ──
        resp = await client.post("/api/v1/patients/", json={
            "full_name": "John Patient",
            "phone": "555-0200",
            "gender": "MALE",
        }, headers=doc_headers)
        assert resp.status_code == 201, f"Patient creation failed: {resp.status_code} {resp.text}"
        patient = resp.json()
        print(f"  PATIENT created: {patient['id']}, hospital_id={patient['hospital_id']}, doctor_id={patient['doctor_id']}")

        # ── 11. List patients ──
        resp = await client.get("/api/v1/patients/", headers=doc_headers)
        assert resp.status_code == 200, f"Patient list failed: {resp.text}"
        patients = resp.json()
        print(f"  PATIENTS listed: count={len(patients)}")
        if patients:
            print(f"    first: {patients[0].get('full_name') if isinstance(patients[0], dict) else '?'}")

        # ── 12. List hospitals ──
        resp = await client.get("/api/v1/hospitals/", headers=doc_headers)
        print(f"  HOSPITALS listed: status={resp.status_code} body_len={len(resp.text)}")

        # ── 13. List doctors ──
        resp = await client.get("/api/v1/doctors/", headers=doc_headers)
        print(f"  DOCTORS listed: status={resp.status_code} body_len={len(resp.text)}")

        # ── 14. Hospital admin creates 2nd doctor and patient (no JWT auto-set) ──
        resp = await client.post("/api/v1/doctors/", json={
            "email": "doctor2@test.com",
            "password": "Test@1234",
            "full_name": "Dr. Second",
        }, headers=ha_headers)
        assert resp.status_code == 201, f"Doctor2 creation failed: {resp.text}"
        doctor2_id = resp.json()["id"]

        resp = await client.post("/api/v1/auth/login", json={"email": "doctor2@test.com", "password": "Test@1234"})
        assert resp.status_code == 200
        doc2_token = resp.json()["access_token"]
        doc2_headers = {"Authorization": f"Bearer {doc2_token}"}

        resp = await client.post("/api/v1/patients/", json={
            "full_name": "Jane Patient",
            "gender": "FEMALE",
        }, headers=doc2_headers)
        assert resp.status_code == 201, f"Patient2 creation failed: {resp.text}"
        patient2 = resp.json()
        print(f"  PATIENT2 created: {patient2['id']}, hospital_id={patient2['hospital_id']}, doctor_id={patient2['doctor_id']}")

        print("\n=== FULL WORKFLOW TEST PASSED ===")

    app.dependency_overrides.clear()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(test_full_workflow())
