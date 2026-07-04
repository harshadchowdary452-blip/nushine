"""Add new values to patientstatus enum in PostgreSQL."""
from sqlalchemy import create_engine, text
from app.config import settings

engine = create_engine(settings.SYNC_DATABASE_URL)
new_values = ["TREATMENT_ONGOING", "OPD", "LOST", "ARCHIVED"]

with engine.connect() as conn:
    existing = {r[0] for r in conn.execute(text("SELECT unnest(enum_range(NULL::patientstatus))"))}
    for val in new_values:
        if val not in existing:
            conn.execute(text(f"ALTER TYPE patientstatus ADD VALUE '{val}'"))
            print(f"  Added '{val}' to patientstatus enum")
        else:
            print(f"  '{val}' already exists in patientstatus enum")
    conn.commit()

print("Done!")
