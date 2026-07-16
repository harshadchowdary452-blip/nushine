"""
MILESTONE 2 SYNC CHAIN E2E TEST
Treatment Progress Synchronization - Full Audit

Tests the complete synchronization chain:
  1. Visit Count: completed/remaining auto-update on each save
  2. Treatment Progress: percentage auto-computes correctly
  3. Case Report: treatment summary auto-updates
  4. Patient Timeline: events for start/visit/complete
  5. Complete Treatment: status transitions correctly
"""
import requests
import sys
from datetime import date, timedelta

BASE = "http://localhost:8000/api/v1"
PASS_COUNT = 0
FAIL_COUNT = 0

def check(label, condition, detail=""):
    global PASS_COUNT, FAIL_COUNT
    if condition:
        PASS_COUNT += 1
        print(f"  PASS  {label}")
    else:
        FAIL_COUNT += 1
        print(f"  FAIL  {label} -- {detail}")


def get_plan(h, plan_id):
    r = requests.get(f"{BASE}/treatment-plans/{plan_id}", headers=h)
    return r.json()


def get_patient_timeline(h, patient_id):
    r = requests.get(f"{BASE}/patients/{patient_id}/timeline", headers=h)
    data = r.json()
    return data.get("entries", []) if isinstance(data, dict) else data


def main():
    global PASS_COUNT, FAIL_COUNT

    print("=" * 60)
    print("SYNC CHAIN E2E TEST")
    print("Treatment Progress Synchronization")
    print("=" * 60)

    # ── Setup ──
    print("\n[0] Login and setup...")
    r = requests.post(f"{BASE}/auth/login", json={"email": "superadmin@dental.com", "password": "SuperAdmin@123"})
    check("Login returns 200", r.status_code == 200)
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    uid = r.json()["user"]["id"]
    user_info = r.json().get("user", {})
    user_id = user_info.get("id")

    # Get hospital
    r = requests.get(f"{BASE}/hospitals/", headers=h)
    hospitals = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    hospital_id = hospitals[0]["id"] if hospitals else None

    # Create patient
    r = requests.post(f"{BASE}/patients/", headers=h, json={
        "full_name": "Sync Test Patient", "phone": "9999999999",
        "gender": "Male", "date_of_birth": "1985-06-15", "hospital_id": hospital_id,
    })
    check("Patient created", r.status_code in (200, 201))
    patient_id = r.json()["id"]

    # Create case
    r = requests.post(f"{BASE}/cases/", headers=h, json={
        "patient_id": patient_id, "chief_complaint": "Multiple caries",
        "diagnosis": "Multiple caries teeth 16,24,36",
    })
    check("Case created", r.status_code in (200, 201))
    case_id = r.json()["id"]

    # ── Step 1: Create Treatment with 4 Estimated Visits ──
    print("\n[1] Create Treatment Plan Items (4 visits)...")
    r = requests.post(f"{BASE}/treatment-plan-items/", headers=h, json={
        "case_id": case_id,
        "items": [
            {"procedure_name": "Root Canal Treatment", "tooth_numbers": ["16"],
             "estimated_visits": 4, "estimated_cost": 20000, "remarks": "4 sitting RCT"},
        ]
    })
    check("Items created", r.status_code in (200, 201))
    items = r.json()
    check("1 item created", len(items) == 1)

    # Assign doctor to item before submit
    r = requests.get(f"{BASE}/doctors", headers=h, params={"limit": 1}, timeout=5)
    docs = r.json()
    doctor_id = docs[0]["id"] if docs else None
    check("Doctor found for assignment", doctor_id is not None)
    r = requests.post(f"{BASE}/treatment-plan-items/assign-doctors", headers=h, json={
        "assignments": [{"item_id": items[0]["id"], "assigned_doctor_id": doctor_id}]
    })
    check("Doctor assigned to item", r.status_code in (200, 201))

    # Submit and approve
    requests.post(f"{BASE}/cases/{case_id}/submit-treatment-plan", headers=h)
    requests.post(f"{BASE}/cases/{case_id}/approve-treatment-plan", headers=h)

    # Get treatment
    r = requests.get(f"{BASE}/treatment-plans/by-case/{case_id}", headers=h)
    treatments = r.json()
    check("1 treatment generated", len(treatments) == 1)
    plan_id = treatments[0]["id"]

    # Verify initial state
    plan = get_plan(h, plan_id)
    check("Initial status is GENERATED", plan["status"] == "GENERATED")
    check("Initial total_sittings is 4", plan["total_sittings"] == 4)
    check("Initial completed_sittings is 0", plan["completed_sittings"] == 0)
    check("Initial remaining_sittings is 4", plan["remaining_sittings"] == 4)
    check("Initial progress is 0%", plan["progress"] == 0.0)

    # ── Step 2: Start Treatment ──
    print("\n[2] Start Treatment...")
    r = requests.post(f"{BASE}/treatment-plans/{plan_id}/start", headers=h)
    check("Start returns 200", r.status_code == 200)
    plan = get_plan(h, plan_id)
    check("Status is IN_PROGRESS", plan["status"] == "IN_PROGRESS")
    check("started_at is set", plan.get("started_at") is not None)

    # ── Step 3: Save Visit 1 → verify 1/4 = 25% ──
    print("\n[3] Save Visit 1...")
    r = requests.post(f"{BASE}/treatment-sittings/", headers=h, json={
        "treatment_plan_id": plan_id, "sitting_number": 1, "doctor_id": user_id,
        "status": "COMPLETED", "procedure_performed": "Access Opening",
        "sitting_date": date.today().isoformat(),
    })
    check("Visit 1 created", r.status_code in (200, 201))
    plan = get_plan(h, plan_id)
    check("completed_sittings = 1", plan["completed_sittings"] == 1, plan["completed_sittings"])
    check("remaining_sittings = 3", plan["remaining_sittings"] == 3, plan["remaining_sittings"])
    check("progress = 25.0%", plan["progress"] == 25.0, plan["progress"])
    check("Status still IN_PROGRESS", plan["status"] == "IN_PROGRESS")

    # ── Step 4: Save Visit 2 → verify 2/4 = 50% ──
    print("\n[4] Save Visit 2...")
    r = requests.post(f"{BASE}/treatment-sittings/", headers=h, json={
        "treatment_plan_id": plan_id, "sitting_number": 2, "doctor_id": user_id,
        "status": "COMPLETED", "procedure_performed": "Cleaning & Shaping",
        "sitting_date": date.today().isoformat(),
    })
    check("Visit 2 created", r.status_code in (200, 201))
    plan = get_plan(h, plan_id)
    check("completed_sittings = 2", plan["completed_sittings"] == 2, plan["completed_sittings"])
    check("remaining_sittings = 2", plan["remaining_sittings"] == 2, plan["remaining_sittings"])
    check("progress = 50.0%", plan["progress"] == 50.0, plan["progress"])

    # ── Step 5: Save Visit 3 → verify 3/4 = 75% ──
    print("\n[5] Save Visit 3...")
    r = requests.post(f"{BASE}/treatment-sittings/", headers=h, json={
        "treatment_plan_id": plan_id, "sitting_number": 3, "doctor_id": user_id,
        "status": "COMPLETED", "procedure_performed": "Obturation",
        "sitting_date": date.today().isoformat(),
    })
    check("Visit 3 created", r.status_code in (200, 201))
    plan = get_plan(h, plan_id)
    check("completed_sittings = 3", plan["completed_sittings"] == 3, plan["completed_sittings"])
    check("remaining_sittings = 1", plan["remaining_sittings"] == 1, plan["remaining_sittings"])
    check("progress = 75.0%", plan["progress"] == 75.0, plan["progress"])

    # ── Step 6: Save Visit 4 → verify 4/4 = 100% ──
    print("\n[6] Save Visit 4...")
    r = requests.post(f"{BASE}/treatment-sittings/", headers=h, json={
        "treatment_plan_id": plan_id, "sitting_number": 4, "doctor_id": user_id,
        "status": "COMPLETED", "procedure_performed": "Crown Preparation",
        "sitting_date": date.today().isoformat(),
    })
    check("Visit 4 created", r.status_code in (200, 201))
    plan = get_plan(h, plan_id)
    check("completed_sittings = 4", plan["completed_sittings"] == 4, plan["completed_sittings"])
    check("remaining_sittings = 0", plan["remaining_sittings"] == 0, plan["remaining_sittings"])
    check("progress = 100.0%", plan["progress"] == 100.0, plan["progress"])

    # ── Step 7: Complete Treatment ──
    print("\n[7] Complete Treatment...")
    r = requests.post(f"{BASE}/treatment-plans/{plan_id}/complete", headers=h,
        json={"outcome": "SUCCESSFUL", "notes": "RCT completed"})
    check("Complete returns 200", r.status_code == 200)
    plan = get_plan(h, plan_id)
    check("Status is COMPLETED", plan["status"] == "COMPLETED")
    check("completed_at is set", plan.get("completed_at") is not None)

    # ── Step 8: Verify Final Counts After Complete ──
    print("\n[8] Verify Final Counts...")
    plan = get_plan(h, plan_id)
    check("completed_sittings = 4", plan["completed_sittings"] == 4, plan["completed_sittings"])
    check("remaining_sittings = 0", plan["remaining_sittings"] == 0, plan["remaining_sittings"])
    check("progress = 100.0%", plan["progress"] == 100.0, plan["progress"])

    # ── Step 9: Verify Visit History ──
    print("\n[9] Verify Visit History...")
    r = requests.get(f"{BASE}/treatment-sittings/by-plan/{plan_id}", headers=h)
    sittings = r.json()
    check("4 sittings exist", len(sittings) == 4, len(sittings))
    for i, s in enumerate(sittings, 1):
        check(f"Visit {i} status is COMPLETED", s["status"] == "COMPLETED")
        check(f"Visit {i} has doctor_name", s.get("doctor_name") is not None, s.get("doctor_name"))
        check(f"Visit {i} has procedure", s.get("procedure_performed") is not None)
        check(f"Visit {i} has sitting_date", s.get("sitting_date") is not None)

    # ── Step 10: Verify Case Report Synchronization ──
    print("\n[10] Verify Case Report Synchronization...")
    r = requests.get(f"{BASE}/cases/{case_id}", headers=h)
    case = r.json()
    check("Case has treatment_plans", len(case.get("treatment_plans", [])) >= 1)
    tp = next((t for t in case.get("treatment_plans", []) if t.get("id") == plan_id), None)
    check("Treatment found in case", tp is not None)
    if tp:
        check("Case treatment status = COMPLETED", tp.get("status") == "COMPLETED")
        check("Case treatment completed_sittings = 4", tp.get("completed_sittings") == 4)
        check("Case treatment progress = 100.0", tp.get("progress") == 100.0)
    check("Diagnosis preserved", case.get("diagnosis") == "Multiple caries teeth 16,24,36")

    # ── Step 11: Verify Patient Timeline ──
    print("\n[11] Verify Patient Timeline...")
    entries = get_patient_timeline(h, patient_id)
    actions = [e.get("action", "") for e in entries]
    check("Timeline has Treatment Started", "Treatment Started" in actions, actions)
    check("Timeline has Treatment Completed", "Treatment Completed" in actions, actions)
    check("Timeline has Sitting Added events", any("Sitting" in a for a in actions), actions)
    check("Timeline has at least 4 entries", len(entries) >= 4, len(entries))

    # Verify timeline entries have required fields
    for entry in entries:
        if "Treatment" in entry.get("action", ""):
            check(f"Timeline '{entry['action']}' has description", bool(entry.get("description")))
            check(f"Timeline '{entry['action']}' has patient_id", entry.get("patient_id") == patient_id)

    # ── Step 12: Verify All API Response Fields ──
    print("\n[12] Verify API Response Completeness...")
    plan = get_plan(h, plan_id)
    required_fields = {
        "total_sittings": 4, "completed_sittings": 4, "remaining_sittings": 0,
        "progress": 100.0, "status": "COMPLETED", "cost": 20000,
        "patient_name": "Sync Test Patient",
    }
    for field, expected in required_fields.items():
        check(f"Response has '{field}'", field in plan, plan.keys())
        if isinstance(expected, (int, float, str)):
            check(f"  '{field}' value = {expected}", plan.get(field) == expected, plan.get(field))
    check("Response has 'case_number'", "case_number" in plan)
    check("Response has 'assigned_doctor_name'", "assigned_doctor_name" in plan)

    # ── Step 12: Verify Doctor Queue Shows Completed ──
    print("\n[12] Verify Doctor Queue...")
    r = requests.get(f"{BASE}/doctor-queue/{user_id}", headers=h)
    check("Doctor queue returns 200", r.status_code == 200)
    queue = r.json()
    check("Queue has stats", "stats" in queue)

    # ── Summary ──
    print("\n" + "=" * 60)
    total = PASS_COUNT + FAIL_COUNT
    print(f"RESULTS: {PASS_COUNT}/{total} passed, {FAIL_COUNT} failed")
    print("=" * 60)
    if FAIL_COUNT == 0:
        print("All sync chain tests passed!")
    else:
        print("Some tests failed. Review above.")
    return FAIL_COUNT


if __name__ == "__main__":
    sys.exit(main())
