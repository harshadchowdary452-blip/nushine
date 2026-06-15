"""Test CRM dashboard SQL queries directly"""
from sqlalchemy import create_engine, text
from app.config import settings

engine = create_engine(settings.SYNC_DATABASE_URL)
with engine.connect() as conn:
    print("=== TEST REVENUE QUERY ===")
    q = text("""
        SELECT p.patient_source,
               COALESCE(SUM(b.paid_amount), 0) as revenue,
               COUNT(DISTINCT p.id) as patients
        FROM patients p
        LEFT JOIN cases c ON c.patient_id = p.id
        LEFT JOIN billings b ON b.case_id = c.id
        WHERE p.patient_source IS NOT NULL
        GROUP BY p.patient_source
        ORDER BY revenue DESC
    """)
    rows = conn.execute(q).fetchall()
    print(f"Found {len(rows)} rows")
    for r in rows:
        print(f"  Source: {str(r[0]):20s} Revenue: {float(r[1]):10.2f} Patients: {r[2]}")

    print()
    print("=== TEST PATIENTS BY SOURCE ===")
    rows2 = conn.execute(text("""
        SELECT patient_source, COUNT(*) as count
        FROM patients
        WHERE patient_source IS NOT NULL
        GROUP BY patient_source
        ORDER BY count DESC
    """)).fetchall()
    for r in rows2:
        print(f"  {str(r[0]):20s} count={r[1]}")
    if not rows2:
        print("  (no results - no patients have source set)")

    print()
    print("=== ALL PATIENTS ===")
    rows3 = conn.execute(text("""
        SELECT id, full_name, patient_source, created_at::text
        FROM patients ORDER BY created_at
    """)).fetchall()
    for r in rows3:
        print(f"  id={str(r[0])[:8]} name={str(r[1]):15s} source={str(r[2]):20s} created={str(r[3]):20s}")

    print()
    print("=== CAMPAIGN ANALYTICS ===")
    camp = conn.execute(text("""
        SELECT COUNT(*) FROM patients WHERE patient_source = 'Campaign'
    """)).scalar()
    print(f"Campaign patients: {camp}")
