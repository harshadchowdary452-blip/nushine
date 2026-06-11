import asyncio
import sys
sys.path.insert(0, ".")

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.database import Base, get_db
from app.main import app
from app.core.security import hash_password
from app.models.user import User
from app.core.permissions import Role
from app.config import settings


async def test_api():
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
        # Seed super admin
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

        # Login as super admin
        resp = await client.post("/api/v1/auth/login", json={"email": "superadmin@dental.com", "password": "SuperAdmin@123"})
        print(f"\nLOGIN: status={resp.status_code}")
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        data = resp.json()
        print(f"  user: {data['user']['email']} role: {data['user']['role']}")
        token = data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create admin group
        resp = await client.post("/api/v1/admin-groups/", json={"name": "Test Group"}, headers=headers)
        print(f"\nCREATE GROUP: status={resp.status_code}")
        assert resp.status_code == 201, f"Group creation failed: {resp.text}"
        group_id = resp.json()["id"]
        print(f"  group_id: {group_id}")

        # Create hospital
        resp = await client.post("/api/v1/hospitals/", json={
            "name": "Test Hospital",
            "admin_group_id": group_id,
            "address": "123 Main St",
            "phone": "555-0100",
            "email": "test@hospital.com",
        }, headers=headers)
        print(f"\nCREATE HOSPITAL: status={resp.status_code}")
        assert resp.status_code == 201, f"Hospital creation failed: {resp.text}"
        hospital_id = resp.json()["id"]
        print(f"  hospital_id: {hospital_id}")

        # Create doctor
        resp = await client.post("/api/v1/doctors/", json={
            "email": "doctor@test.com",
            "password": "Test@1234",
            "full_name": "Dr. Test",
            "specialization": "Orthodontics",
            "hospital_id": hospital_id,
            "admin_group_id": group_id,
        }, headers=headers)
        print(f"\nCREATE DOCTOR: status={resp.status_code}")
        assert resp.status_code == 201, f"Doctor creation failed: {resp.text}"
        doctor_id = resp.json()["id"]
        print(f"  doctor_id: {doctor_id}")

        # Create patient
        resp = await client.post("/api/v1/patients/", json={
            "full_name": "Test Patient",
            "phone": "555-0200",
            "hospital_id": hospital_id,
        }, headers=headers)
        print(f"\nCREATE PATIENT: status={resp.status_code}")
        assert resp.status_code == 201, f"Patient creation failed: {resp.text}"
        print(f"  patient_id: {resp.json()['id']}")

        # Get hospitals
        resp = await client.get("/api/v1/hospitals/", headers=headers)
        print(f"\nGET HOSPITALS: status={resp.status_code}")
        hospitals = resp.json()
        print(f"  count: {len(hospitals)}")

        # Get doctors
        resp = await client.get("/api/v1/doctors/", headers=headers)
        print(f"\nGET DOCTORS: status={resp.status_code}")
        doctors = resp.json()
        print(f"  count: {len(doctors)}")

        # Get patients
        resp = await client.get("/api/v1/patients/", headers=headers)
        print(f"\nGET PATIENTS: status={resp.status_code}")
        patients = resp.json()
        print(f"  count: {len(patients)}")

        # Test login as doctor
        resp = await client.post("/api/v1/auth/login", json={
            "email": "doctor@test.com",
            "password": "Test@1234",
        })
        print(f"\nDOCTOR LOGIN: status={resp.status_code}")
        assert resp.status_code == 200, f"Doctor login failed: {resp.text}"
        print(f"  doctor_user: {resp.json()['user']['email']} role: {resp.json()['user']['role']}")

        print("\n=== ALL API TESTS PASSED ===")

    app.dependency_overrides.clear()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(test_api())
