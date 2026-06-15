"""Database audit for patient_source column"""
from sqlalchemy import create_engine, text
from app.config import settings

engine = create_engine(settings.SYNC_DATABASE_URL)
with engine.connect() as conn:
    print("=== COLUMN INFO ===")
    cols = conn.execute(text("""
        SELECT column_name, data_type, is_nullable, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'patient_source'
    """)).fetchone()
    if cols:
        print(f"Column: {cols[0]}, Type: {cols[1]}, Nullable: {cols[2]}, MaxLen: {cols[3]}")
    else:
        print("COLUMN NOT FOUND!")

    # Check indexes
    idxs = conn.execute(text("""
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'patients' AND indexdef LIKE '%patient_source%'
    """)).fetchall()
    print()
    print("=== INDEXES ===")
    for idx in idxs:
        print(f"Index: {idx[0]}, Def: {idx[1]}")
    if not idxs:
        print("No index on patient_source")

    # Check existing data
    data = conn.execute(text("""
        SELECT id, full_name, patient_source, source_campaign_name,
               source_campaign_id, source_campaign_date
        FROM patients
        ORDER BY created_at DESC
        LIMIT 20
    """)).fetchall()
    print()
    print("=== EXISTING PATIENTS ===")
    total = conn.execute(text("SELECT COUNT(*) FROM patients")).scalar()
    with_source = conn.execute(text("SELECT COUNT(*) FROM patients WHERE patient_source IS NOT NULL")).scalar()
    without_source = conn.execute(text("SELECT COUNT(*) FROM patients WHERE patient_source IS NULL")).scalar()
    print(f"Total patients: {total}")
    print(f"With source: {with_source}")
    print(f"Without source: {without_source}")
    print()
    print(f"{'ID':<10} | {'Name':<20} | {'Source':<20} | {'Campaign Name':<20}")
    print("-" * 75)
    for row in data:
        pid = str(row[0])[:8]
        name = row[1] or "?"
        src = str(row[2] or "NULL")
        camp = str(row[3] or "")
        print(f"{pid:<10} | {name:<20} | {src:<20} | {camp:<20}")
