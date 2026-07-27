"""Investigate summary vs calendar count mismatch"""
import psycopg2, sys, os
from datetime import date, timedelta
os.environ["PYTHONIOENCODING"] = "utf-8"
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
cur = conn.cursor()
HOSPITAL_ID = "2e0920f1-be0d-4cf0-a2f5-e103397c623f"

today = date.today()
# This week: Monday to Sunday
weekday = today.weekday()  # 0=Mon
week_start = today - timedelta(days=weekday)
week_end = week_start + timedelta(days=6)

print(f"Today: {today} ({today.strftime('%A')})")
print(f"Week: {week_start} to {week_end}")

# Count PENDING enquiries due this week (what summary should show)
cur.execute("""
    SELECT enquiry_type, status, due_date, patient_id
    FROM generated_enquiries
    WHERE hospital_id = %s
    AND due_date >= %s AND due_date <= %s
    AND status NOT IN ('COMPLETED', 'CANCELLED', 'LOST', 'CONVERTED')
    ORDER BY due_date
""", (HOSPITAL_ID, week_start, week_end))
rows = cur.fetchall()
print(f"\nPENDING enquiries due this week (summary count): {len(rows)}")
for r in rows:
    print(f"  {r[0]}: status={r[1]} due={r[2]} patient={str(r[3])[:8] if r[3] else 'None'}..")

# What the calendar endpoint returns (default exclude_terminal=true)
cur.execute("""
    SELECT enquiry_type, status, due_date, patient_id
    FROM generated_enquiries
    WHERE hospital_id = %s
    AND due_date >= %s AND due_date <= %s
    AND status NOT IN ('COMPLETED', 'CANCELLED', 'LOST', 'CONVERTED')
    ORDER BY due_date
""", (HOSPITAL_ID, week_start, week_end))
rows2 = cur.fetchall()
print(f"\nCalendar items (same query): {len(rows2)}")

# Check: are there enquiries with due_date outside the week range but still "this week" in some way?
cur.execute("""
    SELECT enquiry_type, status, due_date, patient_id
    FROM generated_enquiries
    WHERE hospital_id = %s
    AND status NOT IN ('COMPLETED', 'CANCELLED', 'LOST', 'CONVERTED')
    ORDER BY due_date DESC
    LIMIT 10
""", (HOSPITAL_ID,))
print(f"\nMost recent PENDING enquiries:")
for r in cur.fetchall():
    print(f"  {r[0]}: status={r[1]} due={r[2]}")

# Check the calendar with include_terminal=true
cur.execute("""
    SELECT enquiry_type, status, due_date, patient_id
    FROM generated_enquiries
    WHERE hospital_id = %s
    AND due_date >= %s AND due_date <= %s
    ORDER BY due_date
""", (HOSPITAL_ID, week_start, week_end))
all_rows = cur.fetchall()
print(f"\nAll enquiries this week (including terminal): {len(all_rows)}")
for r in all_rows:
    print(f"  {r[0]}: status={r[1]} due={r[2]} patient={str(r[3])[:8] if r[3] else 'None'}..")

cur.close()
conn.close()
