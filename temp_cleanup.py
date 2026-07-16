import asyncio, asyncpg

async def cleanup():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/nushine')
    
    # 1. Delete all sittings for treatments we're about to delete
    deleted_sittings = await conn.execute('''
        DELETE FROM treatment_sittings
        WHERE treatment_plan_id IN (
            SELECT id FROM treatment_plans
            WHERE treatment_plan_item_id IS NULL OR auto_created = false
            OR case_id IN (
                SELECT id FROM cases
                WHERE treatment_plan_status::text NOT IN ('approved', 'treatment_in_progress', 'completed')
            )
        )
    ''')
    print(f'Deleted sittings: {deleted_sittings}')
    
    # 2. Delete legacy treatments (no item_id or manual)
    deleted_legacy = await conn.execute('''
        DELETE FROM treatment_plans
        WHERE treatment_plan_item_id IS NULL OR auto_created = false
    ''')
    print(f'Deleted legacy treatments: {deleted_legacy}')
    
    # 3. Delete auto-generated treatments on non-approved cases
    deleted_invalid_auto = await conn.execute('''
        DELETE FROM treatment_plans
        WHERE auto_created = true
        AND case_id IN (
            SELECT id FROM cases
            WHERE treatment_plan_status::text NOT IN ('approved', 'treatment_in_progress', 'completed')
        )
    ''')
    print(f'Deleted auto treatments on non-approved cases: {deleted_invalid_auto}')
    
    # 4. Clear generated_treatment_id from items that no longer have treatments
    cleared = await conn.execute('''
        UPDATE treatment_plan_items
        SET generated_treatment_id = NULL
        WHERE generated_treatment_id IS NOT NULL
        AND generated_treatment_id NOT IN (SELECT id FROM treatment_plans)
    ''')
    print(f'Cleared orphan generated_treatment_id: {cleared}')
    
    # 5. Verify remaining
    remaining = await conn.fetchval('SELECT COUNT(*) FROM treatment_plans')
    remaining_sittings = await conn.fetchval('SELECT COUNT(*) FROM treatment_sittings')
    print(f'\nRemaining treatment_plans: {remaining}')
    print(f'Remaining treatment_sittings: {remaining_sittings}')
    
    # Show remaining treatments
    rows = await conn.fetch('''
        SELECT tp.treatment_number, tp.treatment_name, tp.status::text as s,
               tp.auto_created, c.case_number, c.treatment_plan_status::text as cs,
               p.full_name
        FROM treatment_plans tp
        JOIN cases c ON tp.case_id = c.id
        JOIN patients p ON c.patient_id = p.id
        ORDER BY tp.created_at DESC
        LIMIT 20
    ''')
    print(f'\nRemaining treatments:')
    for r in rows:
        print(f'  {r["treatment_number"]} | {r["treatment_name"][:30]} | {r["s"]} | case={r["cs"]} | patient={r["full_name"][:20]}')
    
    await conn.close()

asyncio.run(cleanup())
