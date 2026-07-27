"""Quick DB query to get real entity IDs."""
import asyncio
from app.database import engine
from sqlalchemy import text

async def main():
    async with engine.begin() as conn:
        r = await conn.execute(text(
            "SELECT id, full_name, status FROM patients "
            "WHERE hospital_id = '2e0920f1-be0d-4cf0-a2f5-e103397c623f' LIMIT 10"
        ))
        rows = r.fetchall()
        print("PATIENTS:")
        for row in rows:
            print(f"  {row[0]}  {row[1]}  ({row[2]})")

        r2 = await conn.execute(text(
            "SELECT id FROM leads "
            "WHERE hospital_id = '2e0920f1-be0d-4cf0-a2f5-e103397c623f' LIMIT 5"
        ))
        rows2 = r2.fetchall()
        print("\nLEADS:")
        for row in rows2:
            print(f"  {row[0]}")

        r3 = await conn.execute(text(
            "SELECT a.id, a.patient_id, a.appointment_date, a.status "
            "FROM appointments a "
            "JOIN patients p ON a.patient_id = p.id "
            "WHERE p.hospital_id = '2e0920f1-be0d-4cf0-a2f5-e103397c623f' "
            "AND a.status = 'SCHEDULED' AND a.is_active = true LIMIT 5"
        ))
        rows3 = r3.fetchall()
        print("\nSCHEDULED APPOINTMENTS:")
        for row in rows3:
            print(f"  {row[0]}  patient={row[1]}  date={row[2]}")

        r4 = await conn.execute(text(
            "SELECT c.id, c.patient_id, c.status "
            "FROM cases c "
            "JOIN patients p ON c.patient_id = p.id "
            "WHERE p.hospital_id = '2e0920f1-be0d-4cf0-a2f5-e103397c623f' LIMIT 5"
        ))
        rows4 = r4.fetchall()
        print("\nCASES:")
        for row in rows4:
            print(f"  {row[0]}  patient={row[1]}  ({row[2]})")

        r5 = await conn.execute(text(
            "SELECT tp.id, tp.case_id, tp.status "
            "FROM treatment_plans tp "
            "JOIN cases c ON tp.case_id = c.id "
            "JOIN patients p ON c.patient_id = p.id "
            "WHERE p.hospital_id = '2e0920f1-be0d-4cf0-a2f5-e103397c623f' LIMIT 5"
        ))
        rows5 = r5.fetchall()
        print("\nTREATMENT PLANS:")
        for row in rows5:
            print(f"  {row[0]}  case={row[1]}  ({row[2]})")

asyncio.run(main())
