import asyncio
from app.database import async_session_factory
from sqlalchemy import text

async def main():
    async with async_session_factory() as db:
        result = await db.execute(text("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'treatment_plans' AND column_name = 'status'"))
        for row in result.all():
            print(f"column={row.column_name} type={row.data_type} udt={row.udt_name}")
        result2 = await db.execute(text("SELECT id, treatment_name, status::text FROM treatment_plans"))
        for row in result2.all():
            print(f"ID={str(row.id)[:8]} name={row.treatment_name} status={row[2]}")

asyncio.run(main())
