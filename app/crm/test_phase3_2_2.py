"""E2E Test: Phase 3.2.2 — Single CRM Rule Engine"""
import requests, json

BASE = "http://localhost:8000/api/v1"
EMAIL = "superadmin@dental.com"
PASS = "SuperAdmin@123"

# Login
r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASS}, timeout=10)
login = r.json()
token = login["access_token"]
H = {"Authorization": f"Bearer {token}"}
print(f"[1] Login OK")

# Get hospital_id for SUPER_ADMIN
r = requests.get(f"{BASE}/auth/me", headers=H, timeout=10)
me = r.json()
hid = me.get("hospital_id")
print(f"[2] hospital_id={hid}")

# Get treatment types
r = requests.get(f"{BASE}/treatment-types", headers=H, timeout=10)
tt_list = r.json()["data"]
tt_id = tt_list[0]["id"] if tt_list else None
print(f"[3] treatment_type_id={tt_id}")

# Get current lead rules
r = requests.get(f"{BASE}/crm/rules/lead", headers=H, timeout=10)
lead_rules = r.json()["data"]["rules"]
print(f"[4] Lead rules: {len(lead_rules)} (values: {json.dumps([{'trigger': r['trigger'], 'action': r['action'], 'wait_time': r['wait_time']} for r in lead_rules])})")

# Get current treatment rules
r = requests.get(f"{BASE}/crm/rules/treatment", headers=H, timeout=10)
tx_rules = r.json()["data"]["rules"]
print(f"[5] Treatment rules: {len(tx_rules)} (values: {json.dumps([{'trigger': r['trigger'], 'action': r['action'], 'wait_time': r['wait_time'], 'visit': r.get('visit')} for r in tx_rules])})")

# Clean up old test leads/patients/enquiries
r = requests.get(f"{BASE}/leads/?skip=0&limit=100", headers=H, timeout=10)
leads = r.json()["data"]
test_leads = [l for l in leads if l.get("full_name", "").startswith("E2E_Rule_")]
if test_leads:
    print(f"[CLEAN] Found {len(test_leads)} old test leads, deleting...")
    for l in test_leads:
        requests.delete(f"{BASE}/leads/{l['id']}", headers=H, timeout=10)

# Create 3 test leads
lead_ids = []
for i in range(3):
    r = requests.post(f"{BASE}/leads/", headers=H, json={
        "full_name": f"E2E_Rule_Test_{i+1}",
        "phone": f"900000{i+1:04d}",
        "source": "WALK_IN",
    }, timeout=10)
    if r.status_code == 200:
        lid = r.json()["data"]["id"]
        lead_ids.append(lid)
        print(f"[6] Created lead {i+1}: {lid}")
    else:
        print(f"[6] Failed to create lead {i+1}: {r.status_code} {r.text[:200]}")

# Convert leads to patients
patient_ids = []
for lid in lead_ids:
    r = requests.post(f"{BASE}/leads/{lid}/convert", headers=H, timeout=10)
    if r.status_code == 200:
        pid = r.json()["data"]["patient_id"]
        patient_ids.append(pid)
        print(f"[7] Converted {lid} -> patient {pid}")
    else:
        print(f"[7] Failed to convert {lid}: {r.status_code} {r.text[:200]}")

# Test the test endpoint — execute rules for first patient
if patient_ids:
    r = requests.post(f"{BASE}/crm/rules/test", headers=H, json={
        "rule_type": "lead",
        "trigger": "NEW_ENQUIRY",
        "patient_id": patient_ids[0],
    }, timeout=10)
    if r.status_code == 200:
        data = r.json()["data"]
        print(f"[8] Test endpoint: created {data['count']} enquiries")
        for e in data["created"]:
            print(f"    -> {e['rule_name']}: due={e['due_date']}, type={e['enquiry_type']}")
    else:
        print(f"[8] Test endpoint failed: {r.status_code} {r.text[:200]}")

# Execute treatment rules for second patient
if patient_ids and tt_id:
    r = requests.post(f"{BASE}/crm/rules/test", headers=H, json={
        "rule_type": "treatment",
        "trigger": "VISIT_COMPLETED",
        "patient_id": patient_ids[1],
        "treatment_type_id": tt_id,
    }, timeout=10)
    if r.status_code == 200:
        data = r.json()["data"]
        print(f"[9] Treatment test: created {data['count']} enquiries")
        for e in data["created"]:
            print(f"    -> {e['rule_name']}: due={e['due_date']}, type={e['enquiry_type']}")
    else:
        print(f"[9] Treatment test failed: {r.status_code} {r.text[:200]}")

# Verify enquiry calendar picks them up
r = requests.get(f"{BASE}/crm/enquiries/calendar", headers=H, timeout=10)
if r.status_code == 200:
    cal = r.json()["data"]
    print(f"[10] Calendar items: {len(cal)}")
else:
    print(f"[10] Calendar failed: {r.status_code} {r.text[:200]}")

# Test duplicate prevention — same rule+patient+trigger should NOT create another
if patient_ids:
    r = requests.post(f"{BASE}/crm/rules/test", headers=H, json={
        "rule_type": "lead",
        "trigger": "NEW_ENQUIRY",
        "patient_id": patient_ids[0],
    }, timeout=10)
    if r.status_code == 200:
        data = r.json()["data"]
        print(f"[11] Duplicate test: created {data['count']} (should be 0)")
    else:
        print(f"[11] Duplicate test failed: {r.status_code}")

# Cleanup
print(f"\n[C] Cleanup: leads={lead_ids}, patients={patient_ids}")
