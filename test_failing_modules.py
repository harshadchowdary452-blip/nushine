"""Test the 5 failing modules: Appointments, Cases, Treatment Plans, Treatment Sittings, Billing"""
import asyncio, sys
sys.path.insert(0, ".")

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.database import Base, get_db
from app.main import app
from app.core.security import hash_password
from app.models.user import User
from app.core.permissions import Role

async def test():
    engine = create_async_engine("sqlite+aiosqlite://", echo=True, connect_args={"check_same_thread": False})
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
        # Seed users
        async with test_session_factory() as db:
            sa = User(email="super@test.com", password_hash=hash_password("Test@123"), full_name="Super", role=Role.SUPER_ADMIN, is_verified=True)
            db.add(sa)
            await db.commit()
            super_admin_id = sa.id

        # Login
        resp = await client.post("/api/v1/auth/login", json={"email": "super@test.com", "password": "Test@123"})
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create group
        resp = await client.post("/api/v1/admin-groups/", json={"name": "Test Group"}, headers=headers)
        assert resp.status_code == 201, f"Group: {resp.text}"
        group_id = resp.json()["id"]

        # Create hospital
        resp = await client.post("/api/v1/hospitals/", json={"name": "Test Hospital", "admin_group_id": group_id, "address": "123 St"}, headers=headers)
        assert resp.status_code == 201, f"Hospital: {resp.text}"
        hospital_id = resp.json()["id"]

        # Create doctor
        resp = await client.post("/api/v1/doctors/", json={"email": "doc@test.com", "password": "Test@123", "full_name": "Dr. Test", "hospital_id": hospital_id, "admin_group_id": group_id}, headers=headers)
        assert resp.status_code == 201, f"Doctor: {resp.text}"
        doctor_id = resp.json()["id"]

        # Create patient
        resp = await client.post("/api/v1/patients/", json={"full_name": "John Patient", "hospital_id": hospital_id, "doctor_id": doctor_id, "phone": "555-0100"}, headers=headers)
        assert resp.status_code == 201, f"Patient: {resp.text}"
        patient_id = resp.json()["id"]
        print(f"  Patient created: {patient_id}")

        # =========== TEST CASE CREATION ===========
        print("\n--- TEST CASE CREATION ---")
        resp = await client.post("/api/v1/cases/", json={
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "chief_complaint": "Tooth pain",
            "diagnosis": "Cavity",
            "notes": "Test case"
        }, headers=headers)
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {resp.text[:200]}")
        if resp.status_code == 201:
            case_id = resp.json()["id"]
            print(f"  Case ID: {case_id}")
        else:
            print("  CASE CREATION FAILED!")
            return

        # =========== TEST APPOINTMENT CREATION ===========
        print("\n--- TEST APPOINTMENT CREATION ---")
        resp = await client.post("/api/v1/appointments/", json={
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "appointment_date": "2026-06-15",
            "appointment_time": "14:30",
            "notes": "Test appointment"
        }, headers=headers)
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {resp.text[:200]}")

        # =========== TEST TREATMENT PLAN CREATION ===========
        print("\n--- TEST TREATMENT PLAN CREATION ---")
        resp = await client.post("/api/v1/treatment-plans/", json={
            "case_id": case_id,
            "treatment_name": "Root Canal",
            "description": "Standard root canal treatment",
            "cost": 5000.0,
            "duration_minutes": 60,
            "notes": "Test treatment plan"
        }, headers=headers)
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {resp.text[:200]}")
        if resp.status_code == 201:
            plan_id = resp.json()["id"]
            print(f"  Plan ID: {plan_id}")
        else:
            print("  TREATMENT PLAN CREATION FAILED!")
            return

        # =========== TEST TREATMENT SITTING CREATION ===========
        print("\n--- TEST TREATMENT SITTING CREATION ---")
        resp = await client.post("/api/v1/treatment-sittings/", json={
            "treatment_plan_id": plan_id,
            "sitting_number": 1,
            "work_done": "Cleaned and prepared",
            "doctor_notes": "Patient tolerated well",
            "next_appointment_date": "2026-06-22"
        }, headers=headers)
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {resp.text[:200]}")

        # =========== TEST BILLING CREATION ===========
        print("\n--- TEST BILLING CREATION ---")
        resp = await client.post("/api/v1/billings/", json={
            "case_id": case_id,
            "total_amount": 5000.0,
            "paid_amount": 1000.0,
            "payment_method": "CASH",
            "notes": "Test billing"
        }, headers=headers)
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {resp.text[:200]}")

        # Verify records exist
        print("\n--- VERIFICATION ---")
        for endpoint, name in [
            ("/api/v1/appointments/", "Appointments"),
            ("/api/v1/cases/", "Cases"),
            ("/api/v1/treatment-plans/", "Treatment Plans"),
            ("/api/v1/billings/", "Billings"),
        ]:
            resp = await client.get(endpoint, headers=headers)
            data = resp.json()
            count = len(data) if isinstance(data, list) else len(data.get("items", data))
            print(f"  {name}: {count} records (status={resp.status_code})")

        print("\n=== ALL TESTS COMPLETED ===")

    app.dependency_overrides.clear()
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(test())
