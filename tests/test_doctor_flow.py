import asyncio
import sys
sys.path.insert(0, ".")

from app.database import async_session_factory
from app.models.user import User
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.core.security import hash_password
from app.core.permissions import Role
from sqlalchemy import select


async def test_doctor_flow():
    print("=" * 60)
    print("DOCTOR CREATION FLOW TEST")
    print("=" * 60)

    async with async_session_factory() as db:
        # Clean up any previous test data
        for u in (await db.execute(select(User).where(User.email.in_(["groupadmin@example.com", "doctor@example.com"])))).scalars():
            await db.delete(u)
        for h in (await db.execute(select(Hospital).where(Hospital.name == "Test Hospital"))).scalars():
            await db.delete(h)
        for g in (await db.execute(select(AdminGroup).where(AdminGroup.name == "Test Group"))).scalars():
            await db.delete(g)
        await db.flush()

        group = AdminGroup(name="Test Group", description="Test")
        db.add(group)
        await db.flush()
        print(f"[PASS] Created admin group: {group.id}")

        hospital = Hospital(name="Test Hospital", admin_group_id=group.id)
        db.add(hospital)
        await db.flush()
        print(f"[PASS] Created hospital: {hospital.id}")

        group_admin = User(
            hospital_id=hospital.id, admin_group_id=group.id,
            email="groupadmin@example.com", password_hash=hash_password("Test@1234"),
            full_name="Test Group Admin", role=Role.GROUP_ADMIN,
        )
        db.add(group_admin)
        await db.flush()
        print(f"[PASS] Created GROUP_ADMIN: {group_admin.id}")

        doctor = User(
            hospital_id=hospital.id, admin_group_id=group.id,
            email="doctor@example.com", password_hash=hash_password("Test@1234"),
            full_name="Dr. Test Doctor", phone="+919999999999",
            role=Role.DOCTOR, specialization="Orthodontics", license_number="LIC-12345",
        )
        db.add(doctor)
        await db.flush()
        print(f"[PASS] Created DOCTOR: {doctor.id}")

        assert doctor.id is not None
        assert doctor.hospital_id == hospital.id
        assert doctor.admin_group_id == group.id
        assert doctor.role == Role.DOCTOR
        assert doctor.is_active == True
        print(f"[PASS] Doctor verified - hospital_id={doctor.hospital_id}, admin_group_id={doctor.admin_group_id}")

        result = await db.execute(select(User).where(User.id == doctor.id))
        fetched = result.scalar_one_or_none()
        assert fetched is not None
        assert fetched.full_name == "Dr. Test Doctor"
        print(f"[PASS] Doctor queryable by ID: {fetched.full_name}")

        result = await db.execute(select(User).where(User.role == Role.DOCTOR, User.hospital_id == hospital.id))
        assert len(result.scalars().all()) >= 1
        print(f"[PASS] Multi-tenant filter works")

        await db.rollback()
        print(f"[PASS] Rolled back test data")

    print("=" * 60)
    print("ALL TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_doctor_flow())
