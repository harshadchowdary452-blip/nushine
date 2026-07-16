import asyncio, sys
sys.path.insert(0, ".")

async def migrate():
    from app.database import async_session_factory
    from sqlalchemy import text

    columns = [
        "ALTER TABLE treatment_sittings ADD COLUMN IF NOT EXISTS lab_name VARCHAR(255)",
        "ALTER TABLE treatment_sittings ADD COLUMN IF NOT EXISTS lab_order_number VARCHAR(100)",
        "ALTER TABLE treatment_sittings ADD COLUMN IF NOT EXISTS lab_sent_date DATE",
        "ALTER TABLE treatment_sittings ADD COLUMN IF NOT EXISTS lab_return_date DATE",
        "ALTER TABLE treatment_sittings ADD COLUMN IF NOT EXISTS lab_cost DOUBLE PRECISION",
    ]
    async with async_session_factory() as db:
        for sql in columns:
            try:
                await db.execute(text(sql))
                print(f"OK: {sql.split('ADD COLUMN IF NOT EXISTS ')[1]}")
            except Exception as e:
                print(f"SKIP: {e}")
        await db.commit()
    print("Migration complete")

asyncio.run(migrate())
