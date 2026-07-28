import psycopg2
conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
cur = conn.cursor()

TADI_HOSPITAL = "2e0920f1-be0d-4cf0-a2f5-e103397c623f"
case_id = "4a59e76c-f0bf-4769-b484-b4880483b2e1"
patient_id = "8462ab2d-464d-4005-bb5d-2cc98825ff77"

# 1. Check case_timelines columns
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'case_timelines' ORDER BY ordinal_position")
print("case_timelines columns:", [r[0] for r in cur.fetchall()])

# 2. Check case timelines
cur.execute("SELECT * FROM case_timelines WHERE case_id = %s ORDER BY created_at DESC LIMIT 5", (case_id,))
cols = [d[0] for d in cur.description]
print("\nCase timelines:")
for row in cur.fetchall():
    print(f"  {dict(zip(cols, row))}")

# 3. ALL enquiries for patient
cur.execute("SELECT * FROM generated_enquiries WHERE patient_id = %s ORDER BY created_at DESC", (patient_id,))
cols = [d[0] for d in cur.description]
print("\nAll enquiries for patient:")
for row in cur.fetchall():
    print(f"  {dict(zip(cols, row))}")

# 4. Check completion_date is null - the case may not have been completed via the API endpoint
cur.execute("SELECT id, status, completion_date, created_at, updated_at FROM cases WHERE id = %s", (case_id,))
print("\nCase details:", cur.fetchone())

# 5. Check if post-ops exist
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'post_ops' ORDER BY ordinal_position")
po_cols = [r[0] for r in cur.fetchall()]
cur.execute("SELECT * FROM post_ops WHERE case_id = %s", (case_id,))
print("\nPost-ops:", cur.fetchall())

# 6. Check treatment plan
cur.execute("SELECT id, case_id, status FROM treatment_plans WHERE case_id = %s", (case_id,))
print("\nTreatment plans:", cur.fetchall())

# 7. Check treatment sittings
cur.execute("""SELECT ts.id, ts.treatment_plan_id, ts.status 
FROM treatment_sittings ts 
JOIN treatment_plans tp ON ts.treatment_plan_id = tp.id 
WHERE tp.case_id = %s""", (case_id,))
print("\nTreatment sittings:", cur.fetchall())

cur.close()
conn.close()
