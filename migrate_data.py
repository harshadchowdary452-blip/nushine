"""Copy data from SQLite to PostgreSQL"""
import sqlite3
import asyncio
import asyncpg
from datetime import date, time, datetime

SQLITE_PATH = "dental_hospital.db"
PG_DSN = "postgresql://postgres:postgres@localhost:5432/nushine"

# Tables to migrate in order (respecting FK dependencies)
TABLE_ORDER = [
    "hospitals", "users", "admin_groups", "patients",
    "consultants", "appointments", "cases",
    "treatment_plans", "treatment_sittings",
    "follow_ups", "follow_up_responses",
    "billings", "payment_transactions",
    "hospital_monthly_expenses",
    "communications_log", "notifications",
    "audit_logs", "status_audit_logs",
    "campaigns", "campaign_recipients",
    "whatsapp_templates", "patient_feedback",
    "hospital_settings", "pre_ops", "post_ops",
    "consultant_notes",
]


def row_to_dict(cursor, row):
    return dict(zip([d[0] for d in cursor.description], row))


async def migrate():
    pg = await asyncpg.connect(PG_DSN)
    sqlite = sqlite3.connect(SQLITE_PATH)
    sqlite.row_factory = row_to_dict
    cur = sqlite.cursor()

    for table in TABLE_ORDER:
        cur.execute(f'SELECT name FROM sqlite_master WHERE type="table" AND name=?', (table,))
        if not cur.fetchone():
            print(f"SKIP {table}: table not found")
            continue

        cur.execute(f'SELECT * FROM "{table}"')
        rows = cur.fetchall()
        if not rows:
            print(f"EMPTY {table}")
            continue

        cols = list(rows[0].keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(cols)))
        col_names = ", ".join(cols)
        insert_sql = f'INSERT INTO "{table}" ({col_names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'

        batch = []
        for row in rows:
            vals = []
            for c in cols:
                v = row[c]
                if isinstance(v, str) and c.endswith("_id"):
                    pass
                vals.append(v)
            batch.append(vals)

        try:
            await pg.executemany(insert_sql, batch)
            print(f"OK   {table}: {len(batch)} rows")
        except Exception as e:
            print(f"FAIL {table}: {e}")
            # Try row by row
            success = 0
            for vals in batch:
                try:
                    await pg.execute(insert_sql, *vals)
                    success += 1
                except Exception as e2:
                    print(f"  ROW FAIL: {vals[:3]}... -> {e2}")
            print(f"  Partial: {success}/{len(batch)}")

    await pg.close()
    sqlite.close()
    print("Migration complete")


asyncio.run(migrate())
