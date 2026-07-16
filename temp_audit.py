import asyncio, asyncpg

async def audit():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/nushine')
    
    # Check exact enum values
    vals = await conn.fetch("SELECT DISTINCT treatment_plan_status::text as v FROM cases")
    print("Distinct case treatment_plan_status values:")
    for v in vals:
        print(f'  "{v["v"]}"')
    
    # Count treatments per case status
    rows = await conn.fetch('''
        SELECT c.treatment_plan_status::text as s, COUNT(DISTINCT c.id) as cases, COUNT(tp.id) as treatments
        FROM cases c LEFT JOIN treatment_plans tp ON tp.case_id = c.id
        GROUP BY s ORDER BY cases DESC
    ''')
    print('\nCases x Treatments:')
    for r in rows:
        print(f'  {r["s"]}: {r["cases"]} cases, {r["treatments"]} treatments')
    
    # Legacy treatments
    legacy_count = await conn.fetchval('''
        SELECT COUNT(*) FROM treatment_plans
        WHERE treatment_plan_item_id IS NULL OR auto_created = false
    ''')
    print(f'\nLegacy to delete: {legacy_count}')
    
    # Valid auto-generated treatments
    valid = await conn.fetchval('''
        SELECT COUNT(*) FROM treatment_plans
        WHERE auto_created = true AND treatment_plan_item_id IS NOT NULL
    ''')
    print(f'Valid auto-generated (keep): {valid}')
    
    # Get the hospital for the superadmin
    hosp = await conn.fetchrow('SELECT id, name FROM hospitals LIMIT 3')
    print('\nHospitals:')
    for h in hosp if hosp else []:
        print(f'  {h["id"]} | {h["name"]}')
    
    # Check doctors
    doctors = await conn.fetch("SELECT id, full_name, role::text as role FROM users WHERE role::text = 'doctor' LIMIT 5")
    print(f'\nDoctors ({len(doctors)} shown):')
    for d in doctors:
        print(f'  {d["id"][:8]}... | {d["full_name"]} | {d["role"]}')
    
    # Check patient hospital linkage
    pat_hosp = await conn.fetchval('''
        SELECT COUNT(DISTINCT p.id) FROM patients p WHERE p.hospital_id IS NULL
    ''')
    print(f'\nPatients without hospital: {pat_hosp}')
    
    await conn.close()

asyncio.run(audit())
