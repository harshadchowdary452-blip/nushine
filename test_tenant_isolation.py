import asyncio, sys
sys.path.insert(0, ".")

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.database import Base, get_db
from app.main import app
from app.core.security import hash_password
from app.models.user import User
from app.core.permissions import Role


async def test_tenant_isolation():
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

        resp = await client.post("/api/v1/auth/login", json={"email": "superadmin@dental.com", "password": "SuperAdmin@123"})
        assert resp.status_code == 200
        super_token = resp.json()["access_token"]
        super_headers = {"Authorization": f"Bearer {super_token}"}

        # ── Create GROUP ──
        resp = await client.post("/api/v1/admin-groups/", json={"name": "Tenant Test Group"}, headers=super_headers)
        assert resp.status_code == 201
        group_id = resp.json()["id"]

        # ── Create GROUP_ADMIN ──
        resp = await client.post(f"/api/v1/admin-groups/{group_id}/admins", json={
            "email": "ga@test.com", "password": "Test@1234", "full_name": "Group Admin",
        }, headers=super_headers)
        assert resp.status_code == 201
        ga_login = await client.post("/api/v1/auth/login", json={"email": "ga@test.com", "password": "Test@1234"})
        ga_headers = {"Authorization": f"Bearer {ga_login.json()['access_token']}"}

        # ── Create TWO hospitals ──
        resp = await client.post("/api/v1/hospitals/", json={
            "name": "Hospital Alpha", "address": "Alpha St", "phone": "111", "admin_group_id": group_id,
        }, headers=ga_headers)
        assert resp.status_code == 201
        hosp_a_id = resp.json()["id"]

        resp = await client.post("/api/v1/hospitals/", json={
            "name": "Hospital Beta", "address": "Beta St", "phone": "222", "admin_group_id": group_id,
        }, headers=ga_headers)
        assert resp.status_code == 201
        hosp_b_id = resp.json()["id"]
        print(f"  Hospital A: {hosp_a_id}, Hospital B: {hosp_b_id}")

        # ── Create HOSPITAL_ADMIN for each hospital ──
        resp = await client.post(f"/api/v1/hospitals/{hosp_a_id}/admins", json={
            "email": "ha_a@test.com", "password": "Test@1234", "full_name": "HA Alpha",
        }, headers=ga_headers)
        assert resp.status_code == 201
        ha_a_login = await client.post("/api/v1/auth/login", json={"email": "ha_a@test.com", "password": "Test@1234"})
        ha_a_headers = {"Authorization": f"Bearer {ha_a_login.json()['access_token']}"}

        resp = await client.post(f"/api/v1/hospitals/{hosp_b_id}/admins", json={
            "email": "ha_b@test.com", "password": "Test@1234", "full_name": "HA Beta",
        }, headers=ga_headers)
        assert resp.status_code == 201
        ha_b_login = await client.post("/api/v1/auth/login", json={"email": "ha_b@test.com", "password": "Test@1234"})
        ha_b_headers = {"Authorization": f"Bearer {ha_b_login.json()['access_token']}"}

        # ── Create DOCTOR in each hospital ──
        resp = await client.post("/api/v1/doctors/", json={
            "email": "doc_a@test.com", "password": "Test@1234", "full_name": "Dr. Alpha",
        }, headers=ha_a_headers)
        assert resp.status_code == 201
        doc_a_login = await client.post("/api/v1/auth/login", json={"email": "doc_a@test.com", "password": "Test@1234"})
        doc_a_headers = {"Authorization": f"Bearer {doc_a_login.json()['access_token']}"}

        resp = await client.post("/api/v1/doctors/", json={
            "email": "doc_b@test.com", "password": "Test@1234", "full_name": "Dr. Beta",
        }, headers=ha_b_headers)
        assert resp.status_code == 201
        doc_b_login = await client.post("/api/v1/auth/login", json={"email": "doc_b@test.com", "password": "Test@1234"})
        doc_b_headers = {"Authorization": f"Bearer {doc_b_login.json()['access_token']}"}

        # ── Create PATIENT in each hospital ──
        resp = await client.post("/api/v1/patients/", json={
            "full_name": "Patient Alpha", "phone": "111", "gender": "MALE",
        }, headers=doc_a_headers)
        assert resp.status_code == 201
        pat_a = resp.json()
        print(f"  Patient A: {pat_a['id']} hosp={pat_a['hospital_id']} doc={pat_a['doctor_id']}")
        assert pat_a["hospital_id"] == hosp_a_id

        resp = await client.post("/api/v1/patients/", json={
            "full_name": "Patient Beta", "phone": "222", "gender": "FEMALE",
        }, headers=doc_b_headers)
        assert resp.status_code == 201
        pat_b = resp.json()
        print(f"  Patient B: {pat_b['id']} hosp={pat_b['hospital_id']} doc={pat_b['doctor_id']}")
        assert pat_b["hospital_id"] == hosp_b_id

        # ════════════════════════════════════════
        # TENANT ISOLATION TESTS
        # ════════════════════════════════════════

        # ── PATIENT isolation ──
        resp = await client.get("/api/v1/patients/", headers=doc_a_headers)
        pats = resp.json()
        pat_ids_doctor_a = [p["id"] for p in (pats if isinstance(pats, list) else pats.get("items", []))]
        assert pat_a["id"] in pat_ids_doctor_a, "Doc A should see Patient A"
        assert pat_b["id"] not in pat_ids_doctor_a, "Doc A should NOT see Patient B"
        print("  PATIENT isolation: DOCTOR A sees only own patient - OK")

        resp = await client.get("/api/v1/patients/", headers=ha_a_headers)
        pats = resp.json()
        pat_ids_ha_a = [p["id"] for p in (pats if isinstance(pats, list) else pats.get("items", []))]
        assert pat_a["id"] in pat_ids_ha_a, "HA Alpha should see Patient A"
        assert pat_b["id"] not in pat_ids_ha_a, "HA Alpha should NOT see Patient B"
        print("  PATIENT isolation: HOSPITAL_ADMIN A sees only own patients - OK")

        # ── Create CASE for each patient ──
        resp = await client.post("/api/v1/cases/", json={
            "patient_id": pat_a["id"], "chief_complaint": "Alpha toothache",
        }, headers=doc_a_headers)
        assert resp.status_code == 201
        case_a_id = resp.json()["id"]

        resp = await client.post("/api/v1/cases/", json={
            "patient_id": pat_b["id"], "chief_complaint": "Beta cavity",
        }, headers=doc_b_headers)
        assert resp.status_code == 201
        case_b_id = resp.json()["id"]

        # ── CASE isolation ──
        resp = await client.get("/api/v1/cases/", headers=doc_a_headers)
        cases = resp.json()
        case_ids_doc_a = [c["id"] for c in (cases if isinstance(cases, list) else cases.get("items", []))]
        assert case_a_id in case_ids_doc_a, "Doc A should see Case A"
        assert case_b_id not in case_ids_doc_a, "Doc A should NOT see Case B"
        print("  CASE isolation: DOCTOR A sees only own case - OK")

        resp = await client.get("/api/v1/cases/", headers=ha_a_headers)
        cases = resp.json()
        case_ids_ha_a = [c["id"] for c in (cases if isinstance(cases, list) else cases.get("items", []))]
        assert case_a_id in case_ids_ha_a, "HA Alpha should see Case A"
        assert case_b_id not in case_ids_ha_a, "HA Alpha should NOT see Case B"
        print("  CASE isolation: HOSPITAL_ADMIN A sees only own hospital's cases - OK")

        # ── Create APPOINTMENT for each patient ──
        doc_a_data = doc_a_login.json()
        doc_b_data = doc_b_login.json()
        resp = await client.post("/api/v1/appointments/", json={
            "patient_id": pat_a["id"], "doctor_id": doc_a_data["user"]["id"],
            "appointment_date": "2026-06-15", "appointment_time": "10:00",
        }, headers=doc_a_headers)
        assert resp.status_code == 201, f"App A failed: {resp.text}"
        apt_a_id = resp.json()["id"]

        resp = await client.post("/api/v1/appointments/", json={
            "patient_id": pat_b["id"], "doctor_id": doc_b_data["user"]["id"],
            "appointment_date": "2026-06-16", "appointment_time": "11:00",
        }, headers=doc_b_headers)
        assert resp.status_code == 201, f"App B failed: {resp.text}"
        apt_b_id = resp.json()["id"]

        # ── APPOINTMENT isolation ──
        resp = await client.get("/api/v1/appointments/", headers=doc_a_headers)
        apps = resp.json()
        app_ids_doc_a = [a["id"] for a in (apps if isinstance(apps, list) else apps.get("items", []))]
        assert apt_a_id in app_ids_doc_a, "Doc A should see Appointment A"
        assert apt_b_id not in app_ids_doc_a, "Doc A should NOT see Appointment B"
        print("  APPOINTMENT isolation: DOCTOR A sees only own appointments - OK")

        resp = await client.get("/api/v1/appointments/", headers=ha_a_headers)
        apps = resp.json()
        app_ids_ha_a = [a["id"] for a in (apps if isinstance(apps, list) else apps.get("items", []))]
        assert apt_a_id in app_ids_ha_a, "HA Alpha should see Appointment A"
        assert apt_b_id not in app_ids_ha_a, "HA Alpha should NOT see Appointment B"
        print("  APPOINTMENT isolation: HOSPITAL_ADMIN A sees only own hospital's appointments - OK")

        # ── Create BILLING for each case ──
        resp = await client.post("/api/v1/billings/", json={
            "case_id": case_a_id, "total_amount": 1000, "paid_amount": 500,
        }, headers=doc_a_headers)
        assert resp.status_code == 201, f"Billing A failed: {resp.text}"
        bill_a_id = resp.json()["id"]

        resp = await client.post("/api/v1/billings/", json={
            "case_id": case_b_id, "total_amount": 2000, "paid_amount": 0,
        }, headers=doc_b_headers)
        assert resp.status_code == 201, f"Billing B failed: {resp.text}"
        bill_b_id = resp.json()["id"]

        # ── BILLING isolation ──
        resp = await client.get("/api/v1/billings/", headers=doc_a_headers)
        bills = resp.json()
        bill_ids_doc_a = [b["id"] for b in (bills if isinstance(bills, list) else bills.get("items", []))]
        assert bill_a_id in bill_ids_doc_a, "Doc A should see Billing A"
        assert bill_b_id not in bill_ids_doc_a, "Doc A should NOT see Billing B"
        print("  BILLING isolation: DOCTOR A sees only own billing - OK")

        resp = await client.get("/api/v1/billings/", headers=ha_a_headers)
        bills = resp.json()
        bill_ids_ha_a = [b["id"] for b in (bills if isinstance(bills, list) else bills.get("items", []))]
        assert bill_a_id in bill_ids_ha_a, "HA Alpha should see Billing A"
        assert bill_b_id not in bill_ids_ha_a, "HA Alpha should NOT see Billing B"
        print("  BILLING isolation: HOSPITAL_ADMIN A sees only own hospital's billing - OK")

        # ── SUPER_ADMIN sees ALL ──
        resp = await client.get("/api/v1/patients/", headers=super_headers)
        patients = resp.json()
        pat_ids_super = [p["id"] for p in (patients if isinstance(patients, list) else patients.get("items", []))]
        assert pat_a["id"] in pat_ids_super
        assert pat_b["id"] in pat_ids_super
        print("  SUPER_ADMIN sees all patients - OK")

        resp = await client.get("/api/v1/cases/", headers=super_headers)
        cases = resp.json()
        case_ids_super = [c["id"] for c in (cases if isinstance(cases, list) else cases.get("items", []))]
        assert case_a_id in case_ids_super
        assert case_b_id in case_ids_super
        print("  SUPER_ADMIN sees all cases - OK")

        resp = await client.get("/api/v1/appointments/", headers=super_headers)
        apps = resp.json()
        app_ids_super = [a["id"] for a in (apps if isinstance(apps, list) else apps.get("items", []))]
        assert apt_a_id in app_ids_super
        assert apt_b_id in app_ids_super
        print("  SUPER_ADMIN sees all appointments - OK")

        resp = await client.get("/api/v1/billings/", headers=super_headers)
        bills = resp.json()
        bill_ids_super = [b["id"] for b in (bills if isinstance(bills, list) else bills.get("items", []))]
        assert bill_a_id in bill_ids_super
        assert bill_b_id in bill_ids_super
        print("  SUPER_ADMIN sees all billings - OK")

        # ── HOSPITAL_ADMIN cross-hospital isolation (explicit hospital_id param) ──
        resp = await client.get(f"/api/v1/patients/?hospital_id={hosp_b_id}", headers=ha_a_headers)
        assert resp.status_code == 200
        cross_pats = resp.json()
        cross_ids = [p["id"] for p in (cross_pats if isinstance(cross_pats, list) else cross_pats.get("items", []))]
        # HA Alpha should NOT see Patient B because they can't access hospital B
        assert pat_b["id"] not in cross_ids or len(cross_ids) == 0, "HA Alpha should not be able to access Hospital B's patients via explicit hospital_id"
        print("  CROSS-HOSPITAL patient isolation via explicit hospital_id - OK (blocked)")

        print("\n=== TENANT ISOLATION TEST PASSED ===")

    app.dependency_overrides.clear()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(test_tenant_isolation())
