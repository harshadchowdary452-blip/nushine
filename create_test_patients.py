"""Create 5 test patients with different sources using direct DB insert"""
from sqlalchemy import create_engine, text
from app.config import settings
import uuid
from datetime import datetime, timezone, date

engine = create_engine(settings.SYNC_DATABASE_URL)
with engine.begin() as conn:
    hospital_id = conn.execute(text("SELECT id FROM hospitals LIMIT 1")).scalar()
    doctor_id = conn.execute(text("SELECT id FROM users WHERE role='DOCTOR' LIMIT 1")).scalar()
    if not doctor_id:
        doctor_id = conn.execute(text("SELECT id FROM users LIMIT 1")).scalar()

    print(f"Using hospital_id: {str(hospital_id)[:8] if hospital_id else 'None'}")
    print(f"Using doctor_id: {str(doctor_id)[:8] if doctor_id else 'None'}")

    patients_data = [
        ("Test_Google", "Google Search", None, None, None),
        ("Test_Instagram", "Instagram", None, None, None),
        ("Test_Referral", "Referral - Existing Patient", None, None, None),
        ("Test_WhatsApp", "WhatsApp", None, None, None),
        ("Test_Campaign", "Campaign", "Summer Smile Campaign", "CAMP-001", date(2026, 6, 1)),
    ]

    ids = []
    for name, source, camp_name, camp_id, camp_date in patients_data:
        pid = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        conn.execute(text("""
            INSERT INTO patients (id, hospital_id, doctor_id, full_name, status, patient_source,
                                  source_campaign_name, source_campaign_id, source_campaign_date,
                                  is_active, created_at, updated_at)
            VALUES (:id, :hid, :did, :name, 'ACTIVE', :src, :camp_name, :camp_id, :camp_date,
                    TRUE, :now, :now)
        """), {
            "id": pid, "hid": hospital_id, "did": doctor_id,
            "name": name, "src": source,
            "camp_name": camp_name, "camp_id": camp_id, "camp_date": camp_date,
            "now": now
        })
        ids.append(pid)
        print(f"Created {name:20s} with source={source:30s} id={pid[:8]}")

    print(f"\nCreated {len(ids)} test patients")

    # Verify
    rows = conn.execute(text("""
        SELECT patient_source, COUNT(*) as cnt
        FROM patients
        WHERE patient_source IS NOT NULL
        GROUP BY patient_source
        ORDER BY cnt DESC
    """)).fetchall()
    print("\n=== GROUPED BY SOURCE ===")
    for r in rows:
        print(f"  {str(r[0]):30s} count={r[1]}")

    # Create a case and billing for one patient to test revenue attribution
    case_id = str(uuid.uuid4())
    billing_id = str(uuid.uuid4())
    patient_id = ids[4]  # Campaign patient
    conn.execute(text("""
        INSERT INTO cases (id, patient_id, hospital_id, doctor_id, case_number, status, is_active, created_at, updated_at)
        VALUES (:id, :pid, :hid, :did, 'CASE-TEST-001', 'COMPLETED', TRUE, :now, :now)
    """), {"id": case_id, "pid": patient_id, "hid": hospital_id, "did": doctor_id, "now": datetime.now(timezone.utc)})
    conn.execute(text("""
        INSERT INTO billings (id, case_id, patient_id, hospital_id, total_amount, paid_amount, payment_status, is_active, created_at, updated_at)
        VALUES (:id, :cid, :pid, :hid, 5000.0, 3000.0, 'PAID', TRUE, :now, :now)
    """), {"id": billing_id, "cid": case_id, "pid": patient_id, "hid": hospital_id, "now": datetime.now(timezone.utc)})
    print(f"\nCreated case+payment for Campaign patient (revenue=3000)")

    print("\nDone!")
