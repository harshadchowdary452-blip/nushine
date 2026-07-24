"""E2E Test: Phase 3.2.2 — Single CRM Rule Engine"""
import requests, json, psycopg2

BASE = "http://localhost:8000/api/v1"
r = requests.post(f"{BASE}/auth/login", json={"email": "superadmin@dental.com", "password": "SuperAdmin@123"}, timeout=10)
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}
print("[1] Login OK")

# Find hospital_id from leads
conn = psycopg2.connect(host="localhost", port=5432, dbname="nushine", user="postgres", password="postgres")
cur = conn.cursor()
cur.execute("SELECT DISTINCT hospital_id FROM leads WHERE hospital_id IS NOT NULL LIMIT 1")
row = cur.fetchone()
hospital_id = row[0] if row else None
print(f"[2] hospital_id={hospital_id}")

# Get rules
cur.execute("SELECT rule_type, trigger_event, action, delay_value, delay_unit, assign_to FROM crm_rules WHERE hospital_id = %s ORDER BY rule_type", (hospital_id,))
rules = cur.fetchall()
print(f"[3] Rules in DB: {len(rules)}")
for r2 in rules:
    print(f"  {r2[0]:10s} | trigger={r2[1]:25s} | action={r2[2]:25s} | delay={r2[3]} {r2[4]}")

# Get treatment types
r = requests.get(f"{BASE}/treatment-types", headers=H, timeout=10)
tt_list = r.json()
tt_id = tt_list[0]["id"] if tt_list else None
print(f"[4] treatment_type_id={tt_id}")

# Get a patient to test with
cur.execute("SELECT id, hospital_id, full_name FROM patients WHERE hospital_id = %s LIMIT 1", (hospital_id,))
prow = cur.fetchone()
if not prow:
    print("[5] No patients found, creating lead and converting...")
    r = requests.post(f"{BASE}/leads/", headers=H, json={
        "full_name": "E2E_Rule_Test_Patient", "phone": "9999900001", "source": "WALK_IN",
    }, timeout=10)
    if r.status_code == 200:
        lid = r.json().get("id")
        r = requests.post(f"{BASE}/leads/{lid}/convert", headers=H, timeout=10)
        if r.status_code == 200:
            pid = r.json().get("patient_id")
            print(f"    Created patient: {pid}")
        else:
            print(f"    Convert failed: {r.status_code} {r.text[:200]}")
            pid = None
    else:
        print(f"    Lead creation failed: {r.status_code} {r.text[:200]}")
        pid = None
else:
    pid = prow[0]
    print(f"[5] Using patient: {prow[2]} ({pid})")

if pid:
    # Execute lead rules via test endpoint
    r = requests.post(f"{BASE}/crm/rules/test", headers=H, json={
        "rule_type": "lead", "trigger": "NEW_ENQUIRY", "patient_id": pid,
    }, timeout=10)
    print(f"[6] Lead test: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"    created={data.get('count', '?')} enquiries")
    else:
        print(f"    {r.text[:200]}")

    # Execute treatment rules
    r = requests.post(f"{BASE}/crm/rules/test", headers=H, json={
        "rule_type": "treatment", "trigger": "VISIT_COMPLETED", "patient_id": pid, "treatment_type_id": tt_id,
    }, timeout=10)
    print(f"[7] Treatment test: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"    created={data.get('count', '?')} enquiries")
    else:
        print(f"    {r.text[:200]}")

    # Duplicate prevention
    r = requests.post(f"{BASE}/crm/rules/test", headers=H, json={
        "rule_type": "lead", "trigger": "NEW_ENQUIRY", "patient_id": pid,
    }, timeout=10)
    if r.status_code == 200:
        data = r.json()
        print(f"[8] Duplicate test: created={data.get('count', '?')} (should be 0)")

    # Calendar
    r = requests.get(f"{BASE}/crm/enquiries/calendar", headers=H, timeout=10)
    if r.status_code == 200:
        cal = r.json()
        if isinstance(cal, list):
            print(f"[9] Calendar: {len(cal)} items")
        elif isinstance(cal, dict):
            for k, v in cal.items():
                if isinstance(v, list):
                    print(f"[9] Calendar [{k}]: {len(v)} items")

cur.close()
conn.close()
print("\n[DONE]")
