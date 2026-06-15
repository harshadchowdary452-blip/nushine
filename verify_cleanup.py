"""Verify test patients and clean up"""
from sqlalchemy import create_engine, text
from app.config import settings

engine = create_engine(settings.SYNC_DATABASE_URL)
with engine.begin() as conn:
    rows = conn.execute(text("""
        SELECT patient_source, COUNT(*) as cnt
        FROM patients
        WHERE patient_source IS NOT NULL
        GROUP BY patient_source
        ORDER BY cnt DESC
    """)).fetchall()
    print("=== PATIENTS BY SOURCE ===")
    for r in rows:
        print(f"  {str(r[0]):30s} count={r[1]}")
    
    total = conn.execute(text("SELECT COUNT(*) FROM patients WHERE patient_source IS NOT NULL")).scalar()
    print(f"Total with source: {total}")
    
    # Clean up test patients
    conn.execute(text("DELETE FROM patients WHERE full_name LIKE 'Test_%'"))
    print("Test patients deleted")
    
    rows_after = conn.execute(text("SELECT COUNT(*) FROM patients WHERE patient_source IS NOT NULL")).scalar()
    print(f"After cleanup, total with source: {rows_after}")
