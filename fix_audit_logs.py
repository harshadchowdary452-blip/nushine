"""Migrate audit_logs with proper datetime conversion"""
import sqlite3
import asyncio
import asyncpg
from datetime import datetime, timezone

SQLITE_PATH = "dental_hospital.db"
PG_DSN = "postgresql://postgres:postgres@localhost:5432/nushine"


async def migrate_audit_logs():
    pg = await asyncpg.connect(PG_DSN)
    sqlite = sqlite3.connect(SQLITE_PATH)
    sqlite.row_factory = lambda c, r: dict(zip([d[0] for d in c.description], r))
    cur = sqlite.cursor()
    await pg.execute("DELETE FROM audit_logs")
    cur.execute("SELECT * FROM audit_logs")
    rows = cur.fetchall()
    if not rows:
        print("No audit_logs rows")
        return
    cols = list(rows[0].keys())
    placeholders = ", ".join(f"${i+1}" for i in range(len(cols)))
    col_names = ", ".join(cols)
    insert_sql = f'INSERT INTO "audit_logs" ({col_names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'
    success = 0
    for row in rows:
        vals = []
        for c in cols:
            v = row[c]
            if isinstance(v, str) and "-" in v and (" " in v or "T" in v) and len(v) > 10:
                try:
                    v = datetime.fromisoformat(v)
                    if v.tzinfo is None:
                        v = v.replace(tzinfo=timezone.utc)
                except Exception:
                    pass
            vals.append(v)
        try:
            await pg.execute(insert_sql, *vals)
            success += 1
        except Exception as e:
            print(f"  ROW FAIL: {vals[:3]} -> {e}")
    print(f"Migrated {success}/{len(rows)} audit_logs")
    await pg.close()
    sqlite.close()


asyncio.run(migrate_audit_logs())
