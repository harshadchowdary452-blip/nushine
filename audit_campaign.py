"""Check campaign columns and all patient data"""
from sqlalchemy import create_engine, text
from app.config import settings

engine = create_engine(settings.SYNC_DATABASE_URL)
with engine.connect() as conn:
    print("=== ALL PATIENT COLUMNS (source/campaign-related) ===")
    cols = conn.execute(text("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'patients'
        ORDER BY ordinal_position
    """)).fetchall()
    for c in cols:
        if "source" in c[0].lower() or "campaign" in c[0].lower():
            print(f"  {c[0]:30s} {c[1]:20s} nullable={c[2]}")

    print()
    print("=== ALL PATIENT DATA ===")
    rows = conn.execute(text("""
        SELECT id, full_name, patient_source, source_campaign_name,
               source_campaign_id, source_campaign_date::text
        FROM patients ORDER BY created_at
    """)).fetchall()
    for r in rows:
        print(f"  id={str(r[0])[:8]} name={str(r[1]):15s} src={str(r[2]):20s} camp_name={str(r[3]):15s} camp_id={str(r[4]):15s} camp_date={str(r[5]):10s}")
