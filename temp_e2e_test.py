import requests, json
from datetime import date, timedelta

BASE = "http://localhost:8000/api/v1"
HOSPITAL_ID = "fadd20f4-4173-423c-bfb0-a45d5435bc56"

r = requests.post(f"{BASE}/auth/login", json={"email": "superadmin@dental.com", "password": "SuperAdmin@123"})
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}
print("Logged in")

# Create 5 leads
leads = [
    {"lead_name": "Rahul Sharma", "mobile": "9876543210", "source": "WALK_IN", "hospital_id": HOSPITAL_ID},
    {"lead_name": "Priya Patel", "mobile": "9876543211", "source": "WEBSITE", "hospital_id": HOSPITAL_ID},
    {"lead_name": "Amit Kumar", "mobile": "9876543212", "source": "REFERRAL", "hospital_id": HOSPITAL_ID},
    {"lead_name": "Sneha Reddy", "mobile": "9876543213", "source": "SOCIAL_MEDIA", "hospital_id": HOSPITAL_ID},
    {"lead_name": "Vijay Singh", "mobile": "9876543214", "source": "WALK_IN", "hospital_id": HOSPITAL_ID},
]
lead_ids = []
for i, ld in enumerate(leads):
    r = requests.post(f"{BASE}/leads/", headers=H, json=ld)
    print(f"Lead {i+1}: {r.status_code}")
    if r.status_code == 201:
        lead_ids.append(r.json()["id"])

# Convert all
patient_ids = []
for i, lid in enumerate(lead_ids):
    r = requests.post(f"{BASE}/leads/{lid}/convert", headers=H, json={"patient_name": leads[i]["lead_name"], "phone": leads[i]["mobile"]})
    print(f"Convert {i+1}: {r.status_code}")
    if r.status_code == 200:
        patient_ids.append(r.json().get("patient_id"))
    else:
        patient_ids.append(None)

valid_patients = [p for p in patient_ids if p]
print(f"Patients created: {len(valid_patients)}")

# Test lead rules
created = 0
for i, pid in enumerate(patient_ids):
    if not pid:
        continue
    r = requests.post(f"{BASE}/crm/rules/test", headers=H, json={"rule_type": "lead", "trigger": "NEW_ENQUIRY", "patient_id": pid})
    if r.status_code == 200:
        c = r.json().get("count", 0)
        created += c
        print(f"Lead rule test {i+1}: {c} enquiries")
    else:
        print(f"Lead rule test {i+1} FAILED: {r.status_code} {r.text[:200]}")

print(f"Total lead enquiries: {created}")

# Test treatment rules
tt_r = requests.get(f"{BASE}/treatment-types", headers=H)
tt_list = tt_r.json() if tt_r.status_code == 200 else []
tx_created = 0
if tt_list:
    tt_id = tt_list[0]["id"]
    for i, pid in enumerate(patient_ids):
        if not pid:
            continue
        r = requests.post(f"{BASE}/crm/rules/test", headers=H, json={"rule_type": "treatment", "trigger": "VISIT_COMPLETED", "patient_id": pid, "treatment_type_id": tt_id})
        if r.status_code == 200:
            c = r.json().get("count", 0)
            tx_created += c
            print(f"Treatment rule test {i+1}: {c} enquiries")
        else:
            print(f"Treatment rule test {i+1} FAILED: {r.status_code} {r.text[:200]}")

print(f"Total treatment enquiries: {tx_created}")

# Check GeneratedEnquiry records
r = requests.get(f"{BASE}/crm/treatment-automation/generated-enquiries", headers=H)
if r.status_code == 200:
    data = r.json()
    items = data.get("items", data) if isinstance(data, dict) else data
    print(f"GeneratedEnquiry count: {len(items) if isinstance(items, list) else 'N/A'}")
else:
    print(f"GeneratedEnquiries query: {r.status_code} {r.text[:200]}")

# Check enquiry calendar
today = date.today()
r = requests.get(f"{BASE}/crm/enquiries/calendar", headers=H, params={"start_date": (today - timedelta(days=7)).isoformat(), "end_date": (today + timedelta(days=14)).isoformat()})
if r.status_code == 200:
    cal = r.json()
    gen = [c for c in cal if c.get("source") == "generated_enquiry"]
    print(f"Calendar: {len(cal)} total items")
    print(f"  generated_enquiry items: {len(gen)}")
    for g in gen:
        pname = g.get("patient_name", "?")
        tname = g.get("treatment_name", "?")
        due = g.get("due_date", "?")
        status = g.get("status", "?")
        print(f"  [{g.get('follow_up_type', '?')}] {pname} | {tname} | due: {due} | status: {status}")
else:
    print(f"Calendar: {r.status_code} {r.text[:200]}")

print("\n=== DONE ===")
