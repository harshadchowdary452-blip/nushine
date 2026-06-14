"""Full migration: create schema + migrate all data from SQLite to PostgreSQL"""
import asyncio, sqlite3, sys, os
from pathlib import Path
from datetime import datetime, timezone, date, time

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./dental_hospital.db"
os.environ["DATABASE_URL_SYNC"] = "sqlite:///./dental_hospital.db"

from app.database import Base
from app.models import *

from sqlalchemy import create_engine, MetaData, text, Table
from sqlalchemy.ext.asyncio import create_async_engine

SQLITE_PATH = "dental_hospital.db"
PG_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/nushine"
SYNC_PG_URL = "postgresql://postgres:postgres@localhost:5432/nushine"

INSERTION_ORDER = [
    "admin_groups", "email_templates", "hospitals",
    "users", "patients", "consultants", "appointments", "cases",
    "consultant_notes", "treatment_plans", "treatment_sittings",
    "pre_ops", "post_ops", "billings", "payment_transactions",
    "hospital_monthly_expenses", "refresh_tokens",
    "communication_logs", "notifications", "patient_feedback",
    "follow_ups", "status_audit_logs", "audit_logs",
]

BOOLEAN_COLS = {
    "is_active", "is_verified", "reminder_sent", "is_primary", "is_template", "is_global",
    "is_open", "paid", "override", "payment_done",
}

ENUM_MAP = {
    "patients": {"status": {"TREATMENT_COMPLETED": "COMPLETED"}},
}

COLUMN_DEFAULTS = {
    "follow_ups": {"follow_up_type": "MANUAL"},
    "patients": {"diagnosis": None},
    "treatment_plans": {"paid_amount": 0.0},
    "billings": {"original_amount": 0.0, "paid_amount": 0.0, "pending_amount": 0.0},
}

DATE_COLS = {"date_of_birth", "follow_up_date", "appointment_date", "completion_date",
             "start_date", "due_date", "treatment_completed_date", "expected_completion_date"}
TIME_COLS = {"follow_up_time", "appointment_time"}

async def create_schema():
    engine = create_async_engine(PG_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print("Schema created OK")

def clean_value(table_name: str, col_name: str, val, col_type):
    """Convert SQLite value to Python type matching PG column."""
    if val is None or val == "":
        return None
    if isinstance(val, str):
        val = val.strip()
        if val == "":
            return None
    is_bool = col_name in BOOLEAN_COLS or "bool" in str(col_type).lower()
    if is_bool and isinstance(val, int):
        return bool(val)
    is_date = col_name in DATE_COLS or "date" in str(col_type).lower() and "time" not in str(col_type).lower()
    is_datetime = "datetime" in str(col_type).lower() or "timestamp" in str(col_type).lower()
    is_time = col_name in TIME_COLS or col_name.endswith("_time") and col_name not in ("created_at", "updated_at")
    if is_time and isinstance(val, str):
        try:
            parts = val.split(":", 2)
            return time(int(parts[0]), int(parts[1]), int(float(parts[2])) if "." not in parts[2] else int(float(parts[2].split(".")[0])),
                        int(float(parts[2].split(".")[1]) * 1000000) if "." in parts[2] else 0)
        except:
            return val
    if is_date and isinstance(val, str) and len(val) == 10:
        try:
            return date.fromisoformat(val)
        except:
            return val
    if is_date and isinstance(val, str) and " " in val:
        try:
            return datetime.fromisoformat(val.replace("T", " ").split(".")[0]).date()
        except:
            return val
    if is_datetime and isinstance(val, str):
        try:
            dt = datetime.fromisoformat(val.replace("T", " "))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except:
            return val
    if table_name in ENUM_MAP and col_name in ENUM_MAP[table_name] and val in ENUM_MAP[table_name][col_name]:
        return ENUM_MAP[table_name][col_name][val]
    return val

def migrate_data():
    sqlite = sqlite3.connect(SQLITE_PATH)
    sqlite.row_factory = lambda c, r: dict(zip([d[0] for d in c.description], r))
    cur = sqlite.cursor()
    sync_engine = create_engine(SYNC_PG_URL, echo=False)
    metadata = MetaData()
    metadata.reflect(bind=sync_engine)
    total_ok = total_fail = 0

    for table_name in INSERTION_ORDER:
        if table_name not in metadata.tables:
            print(f"  {table_name}: SKIP (no PG table)")
            continue
        try:
            cur.execute(f'SELECT name FROM sqlite_master WHERE type="table" AND name=?', (table_name,))
            if not cur.fetchone():
                print(f"  {table_name}: SKIP (no SQLite table)")
                continue
            cur.execute(f'SELECT * FROM "{table_name}"')
            rows = cur.fetchall()
            if not rows:
                print(f"  {table_name}: 0 rows")
                continue
        except Exception as e:
            print(f"  {table_name}: READ ERROR - {e}")
            continue

        pg_table: Table = metadata.tables[table_name]
        defaults = COLUMN_DEFAULTS.get(table_name, {})
        ok = fail = 0

        for row in rows:
            cleaned = {}
            for col in pg_table.columns:
                col_name = col.name
                if col_name in row:
                    raw = row[col_name]
                    cleaned[col_name] = clean_value(table_name, col_name, raw, col.type)
                elif col_name in defaults:
                    cleaned[col_name] = defaults[col_name]
                elif col.nullable:
                    cleaned[col_name] = None
                else:
                    cleaned[col_name] = None
            try:
                with sync_engine.connect() as conn:
                    conn.execute(pg_table.insert(), cleaned)
                    conn.commit()
                ok += 1
            except Exception as e:
                fail += 1
                if fail <= 3:
                    print(f"    {table_name} ROW FAIL: {row.get('id', '?')} -> {e}")

        print(f"  {table_name}: {ok} ok, {fail} fail")
        total_ok += ok
        total_fail += fail

    sync_engine.dispose()
    sqlite.close()
    print(f"\nTotal: {total_ok} inserted, {total_fail} failed")

async def main():
    print("Step 1: Creating schema...")
    await create_schema()
    print("\nStep 2: Migrating data...")
    migrate_data()
    print("\nDone")

asyncio.run(main())
