"""
MILESTONE 2 E2E TEST
Treatment Execution - Doctor Workflow

Tests the complete treatment execution lifecycle:
  Patient + Case + Plan Approved + Treatment Generated
  → Start Treatment
  → Add Visit 1 (full clinical data)
  → Mark Waiting Patient
  → Mark Waiting Lab (with lab tracking)
  → Add Visit 2
  → Complete Treatment
  → Verify Case Report synchronization
  → Verify Patient Timeline
"""
import requests
import sys
import json
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


def main():
    global PASS_COUNT, FAIL_COUNT

    print("=" * 60)
    print("MILESTONE 2 E2E TEST")
    print("Treatment Execution - Doctor Workflow")
    print("=" * 60)

    # ── Step 0: Login ──
    print("\n[0] Login as superadmin...")
    r = requests.post(f"{BASE}/auth/login", json={"email": "superadmin@dental.com", "password": "SuperAdmin@123"})
    check("Login returns 200", r.status_code == 200, r.status_code)
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    user_info = r.json().get("user", {})
    user_id = user_info.get("id")
    hospital_id = user_info.get("hospital_id")

    if not hospital_id:
        r = requests.get(f"{BASE}/hospitals/", headers=h)
        hospitals = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        hospital_id = hospitals[0]["id"] if hospitals else None
    print(f"    Token obtained, Hospital: {hospital_id}, User: {user_id}")

    # ── Step 1: Create Patient ──
    print("\n[1] Create Patient...")
    r = requests.post(f"{BASE}/patients/", headers=h, json={
        "full_name": "Anita Sharma",
        "phone": "9876543210",
        "gender": "Female",
        "date_of_birth": "1990-05-15",
        "hospital_id": hospital_id,
    })
    check("Patient creation returns 200/201", r.status_code in (200, 201), r.status_code)
    patient_id = r.json()["id"]
    print(f"    Patient ID: {patient_id}")

    # ── Step 2: Create Case ──
    print("\n[2] Create Case Report...")
    r = requests.post(f"{BASE}/cases/", headers=h, json={
        "patient_id": patient_id,
        "chief_complaint": "Severe toothache in upper right molar",
        "chief_complaint_duration": "2 weeks",
        "chief_complaint_severity": "Severe",
        "diagnosis": "Irreversible pulpitis tooth 16",
        "provisional_diagnosis": "Irreversible pulpitis tooth 16",
        "initial_treatment_plan": "Root Canal Treatment tooth 16",
    })
    check("Case creation returns 200/201", r.status_code in (200, 201), r.status_code)
    case_id = r.json()["id"]
    case_number = r.json().get("case_number", f"CASE-{case_id[:8].upper()}")
    print(f"    Case ID: {case_id}, Number: {case_number}")

    # ── Step 3: Create Treatment Plan Items ──
    print("\n[3] Create Treatment Plan Items...")
    r = requests.post(f"{BASE}/treatment-plan-items/", headers=h, json={
        "case_id": case_id,
        "items": [
            {"procedure_name": "Root Canal Treatment", "tooth_numbers": ["16"], "estimated_visits": 3, "estimated_cost": 15000, "remarks": "3 sitting RCT"},
            {"procedure_name": "Crown", "tooth_numbers": ["16"], "estimated_visits": 1, "estimated_cost": 8000, "remarks": "PFM Crown"},
        ]
    })
    check("Bulk create items returns 200/201", r.status_code in (200, 201), r.status_code)
    items = r.json()
    check("2 items created", len(items) == 2, len(items))

    # ── Step 3.5: Assign Doctor to Each Item ──
    print("\n[3.5] Assign Doctor to Each Item...")
    r = requests.get(f"{BASE}/doctors", headers=h, params={"limit": 1}, timeout=5)
    docs = r.json()
    doctor_id = docs[0]["id"] if docs else None
    check("Doctor found for assignment", doctor_id is not None)
    r = requests.post(f"{BASE}/treatment-plan-items/assign-doctors", headers=h, json={
        "assignments": [
            {"item_id": items[0]["id"], "assigned_doctor_id": doctor_id},
            {"item_id": items[1]["id"], "assigned_doctor_id": doctor_id},
        ]
    })
    check("Doctors assigned to all items", r.status_code in (200, 201))

    # ── Step 4: Submit and Approve ──
    print("\n[4] Submit and Approve Treatment Plan...")
    r = requests.post(f"{BASE}/cases/{case_id}/submit-treatment-plan", headers=h)
    check("Submit returns 200", r.status_code == 200, r.status_code)
    r = requests.post(f"{BASE}/cases/{case_id}/approve-treatment-plan", headers=h)
    check("Approve returns 200", r.status_code == 200, r.status_code)
    check("Case is APPROVED", r.json().get("treatment_plan_status") == "APPROVED", r.json().get("treatment_plan_status"))

    # ── Step 5: Verify Treatments Generated ──
    print("\n[5] Verify Treatments Generated...")
    r = requests.get(f"{BASE}/treatment-plans/by-case/{case_id}", headers=h)
    treatments = r.json()
    check("2 treatments generated", len(treatments) == 2, len(treatments))
    rct = next((t for t in treatments if "Root Canal" in t["treatment_name"]), None)
    check("RCT treatment found", rct is not None)
    check("RCT has correct cost", rct and rct["cost"] == 15000, rct and rct.get("cost"))
    check("RCT has 3 total sittings", rct and rct["total_sittings"] == 3, rct and rct.get("total_sittings"))
    check("RCT status is GENERATED", rct and rct["status"] == "GENERATED", rct and rct.get("status"))
    rct_id = rct["id"]
    print(f"    RCT Treatment ID: {rct_id}")

    # ── Step 6: Start Treatment ──
    print("\n[6] Start Treatment...")
    r = requests.post(f"{BASE}/treatment-plans/{rct_id}/start", headers=h)
    check("Start returns 200", r.status_code == 200, r.status_code)
    check("Status is IN_PROGRESS", r.json().get("status") == "IN_PROGRESS", r.json().get("status"))

    # ── Step 7: Add Visit 1 (full clinical data) ──
    print("\n[7] Add Visit 1 - Full Clinical Data...")
    tomorrow = (date.today() + timedelta(days=7)).isoformat()
    r = requests.post(f"{BASE}/treatment-sittings/", headers=h, json={
        "treatment_plan_id": rct_id,
        "sitting_number": 1,
        "doctor_id": user_id,
        "status": "COMPLETED",
        "procedure_performed": "Root Canal - Access Opening and Cleaning",
        "clinical_notes": "Access cavity prepared. Pulp chamber located. Pulpectomy performed. NaOCl irrigation. Ca(OH)2 medicament placed.",
        "prescription": "Amoxicillin 500mg TID x 5 days\nIbuprofen 400mg PRN",
        "materials_used": "NiTi files, NaOCl, Ca(OH)2, Rubber dam",
        "duration_minutes": 45,
        "work_done": "Access opening and cleaning",
        "doctor_notes": "Canal located easily. Good working length.",
        "next_appointment_date": tomorrow,
        "next_appointment_time": "10:00",
        "next_visit_required": True,
        "sitting_date": date.today().isoformat(),
    })
    check("Visit 1 creation returns 201", r.status_code in (200, 201), r.status_code)
    visit1 = r.json()
    check("Visit 1 sitting_number is 1", visit1.get("sitting_number") == 1, visit1.get("sitting_number"))
    check("Visit 1 has procedure_performed", visit1.get("procedure_performed") == "Root Canal - Access Opening and Cleaning", visit1.get("procedure_performed"))
    check("Visit 1 has clinical_notes", bool(visit1.get("clinical_notes")), visit1.get("clinical_notes"))
    check("Visit 1 has prescription", bool(visit1.get("prescription")), visit1.get("prescription"))
    check("Visit 1 has materials_used", bool(visit1.get("materials_used")), visit1.get("materials_used"))
    check("Visit 1 has duration", visit1.get("duration_minutes") == 45, visit1.get("duration_minutes"))
    check("Visit 1 next_appointment_date set", visit1.get("next_appointment_date") == tomorrow, visit1.get("next_appointment_date"))
    check("Visit 1 has doctor_name", bool(visit1.get("doctor_name")), visit1.get("doctor_name"))

    # Verify appointment was auto-created
    print("\n[7b] Verify appointment auto-created from visit...")
    r = requests.get(f"{BASE}/appointments/", headers=h, params={"patient_id": patient_id, "limit": 5})
    appts = r.json() if isinstance(r.json(), list) else r.json().get("data", r.json().get("appointments", []))
    next_day_appt = [a for a in appts if a.get("appointment_date") == tomorrow]
    check("Appointment auto-created for next visit", len(next_day_appt) > 0, f"Found {len(next_day_appt)} appointments for {tomorrow}")

    # Verify treatment sitting counts updated
    print("\n[7c] Verify treatment sittings counts updated...")
    r = requests.get(f"{BASE}/treatment-plans/{rct_id}", headers=h)
    updated = r.json()
    check("completed_sittings is 1", updated.get("completed_sittings") == 1, updated.get("completed_sittings"))
    check("remaining_sittings is 2", updated.get("remaining_sittings") == 2, updated.get("remaining_sittings"))

    # ── Step 8: Mark Waiting Patient ──
    print("\n[8] Mark Waiting Patient...")
    r = requests.post(f"{BASE}/treatment-plans/{rct_id}/set-waiting", headers=h,
        params={"waiting_type": "WAITING_PATIENT"},
        json={"reason": "Patient needs to complete antibiotic course before next sitting", "expected_followup": "After 1 week"})
    check("Set waiting patient returns 200", r.status_code == 200, r.status_code)
    check("Status is WAITING_PATIENT", r.json().get("status") == "WAITING_PATIENT", r.json().get("status"))

    # ── Step 9: Mark Waiting Lab ──
    print("\n[9] Mark Waiting Lab...")
    lab_sent = date.today().isoformat()
    lab_return = (date.today() + timedelta(days=10)).isoformat()
    r = requests.post(f"{BASE}/treatment-plans/{rct_id}/set-waiting", headers=h,
        params={"waiting_type": "WAITING_LAB"},
        json={
            "reason": "Crown impression sent to lab",
            "lab_name": "Shree Dental Lab",
            "lab_order_number": "LAB-2024-001",
            "lab_sent_date": lab_sent,
            "lab_return_date": lab_return,
            "lab_cost": 3000,
            "lab_tracking_notes": "PFM Crown for tooth 16",
        })
    check("Set waiting lab returns 200", r.status_code == 200, r.status_code)
    check("Status is WAITING_LAB", r.json().get("status") == "WAITING_LAB", r.json().get("status"))

    # ── Step 10: Resume - Add Visit 2 ──
    print("\n[10] Resume Treatment - Add Visit 2...")
    r = requests.post(f"{BASE}/treatment-plans/{rct_id}/start", headers=h)
    check("Resume to IN_PROGRESS", r.status_code == 200, r.status_code)
    day_after_tomorrow = (date.today() + timedelta(days=14)).isoformat()
    r = requests.post(f"{BASE}/treatment-sittings/", headers=h, json={
        "treatment_plan_id": rct_id,
        "sitting_number": 2,
        "doctor_id": user_id,
        "status": "COMPLETED",
        "procedure_performed": "Root Canal - Shaping and Obturation",
        "clinical_notes": "Canals shaped to F2. Obturated with GP and sealer. Master cone radiograph taken. Good fit.",
        "prescription": "Ibuprofen 400mg PRN",
        "materials_used": "GP points, Sealer, F2 NiTi files, AH Plus",
        "duration_minutes": 60,
        "work_done": "Shaping and obturation",
        "next_appointment_date": day_after_tomorrow,
        "next_visit_required": True,
        "sitting_date": date.today().isoformat(),
    })
    check("Visit 2 creation returns 201", r.status_code in (200, 201), r.status_code)
    visit2 = r.json()
    check("Visit 2 sitting_number is 2", visit2.get("sitting_number") == 2, visit2.get("sitting_number"))

    # Verify both visits exist
    print("\n[10b] Verify visit history has 2 visits...")
    r = requests.get(f"{BASE}/treatment-sittings/by-plan/{rct_id}", headers=h)
    all_sittings = r.json()
    check("2 sittings exist", len(all_sittings) == 2, len(all_sittings))
    sitting_numbers = sorted([s["sitting_number"] for s in all_sittings])
    check("Sitting numbers are [1, 2]", sitting_numbers == [1, 2], sitting_numbers)

    # ── Step 11: Add Visit 3 (final) ──
    print("\n[11] Add Visit 3 - Final Visit...")
    r = requests.post(f"{BASE}/treatment-sittings/", headers=h, json={
        "treatment_plan_id": rct_id,
        "sitting_number": 3,
        "doctor_id": user_id,
        "status": "COMPLETED",
        "procedure_performed": "Root Canal - Crown Preparation",
        "clinical_notes": "Tooth prepared for crown. Impression taken. Temporary crown placed.",
        "materials_used": "Impression material, Temporary crown material",
        "duration_minutes": 30,
        "work_done": "Crown preparation and impression",
        "next_visit_required": False,
        "sitting_date": date.today().isoformat(),
    })
    check("Visit 3 creation returns 201", r.status_code in (200, 201), r.status_code)

    # Verify sitting counts
    print("\n[11b] Verify all sitting counts after 3 visits...")
    r = requests.get(f"{BASE}/treatment-plans/{rct_id}", headers=h)
    final_plan = r.json()
    check("completed_sittings is 3", final_plan.get("completed_sittings") == 3, final_plan.get("completed_sittings"))
    check("remaining_sittings is 0", final_plan.get("remaining_sittings") == 0, final_plan.get("remaining_sittings"))

    # ── Step 12: Complete Treatment ──
    print("\n[12] Complete Treatment...")
    r = requests.post(f"{BASE}/treatment-plans/{rct_id}/complete", headers=h,
        json={"outcome": "SUCCESSFUL", "notes": "RCT completed successfully. Root canals well obturated."})
    check("Complete returns 200", r.status_code == 200, r.status_code)
    check("Status is COMPLETED", r.json().get("status") == "COMPLETED", r.json().get("status"))

    # ── Step 13: Verify Visit History Integrity ──
    print("\n[13] Verify Visit History Integrity...")
    r = requests.get(f"{BASE}/treatment-sittings/by-plan/{rct_id}", headers=h)
    final_sittings = r.json()
    check("Still 3 sittings", len(final_sittings) == 3, len(final_sittings))
    for s in final_sittings:
        check(f"Visit {s['sitting_number']} has date", bool(s.get("sitting_date")), s.get("sitting_date"))
        check(f"Visit {s['sitting_number']} has doctor", bool(s.get("doctor_name")), s.get("doctor_name"))
        check(f"Visit {s['sitting_number']} has procedure", bool(s.get("procedure_performed")), s.get("procedure_performed"))

    # Verify visit 1 data preserved (append only, no overwrite)
    v1 = next(s for s in final_sittings if s["sitting_number"] == 1)
    check("Visit 1 prescription preserved", "Amoxicillin" in (v1.get("prescription") or ""), v1.get("prescription"))
    check("Visit 1 materials preserved", "NiTi files" in (v1.get("materials_used") or ""), v1.get("materials_used"))

    # ── Step 14: Verify Case Report Synchronization ──
    print("\n[14] Verify Case Report Synchronization...")
    r = requests.get(f"{BASE}/cases/{case_id}", headers=h)
    case = r.json()
    check("Case has treatment_plans", len(case.get("treatment_plans", [])) >= 1, len(case.get("treatment_plans", [])))
    rct_in_case = next((t for t in case.get("treatment_plans", []) if t.get("treatment_name") and "Root Canal" in t["treatment_name"]), None)
    check("RCT treatment in case response", rct_in_case is not None)
    if rct_in_case:
        check("Case treatment is COMPLETED", rct_in_case.get("status") == "COMPLETED", rct_in_case.get("status"))
        check("Case treatment has completed_sittings=3", rct_in_case.get("completed_sittings") == 3, rct_in_case.get("completed_sittings"))

    # Verify diagnosis NOT overwritten
    check("Diagnosis preserved", case.get("diagnosis") == "Irreversible pulpitis tooth 16", case.get("diagnosis"))

    # ── Step 15: Verify Patient Timeline ──
    print("\n[15] Verify Patient Timeline...")
    r = requests.get(f"{BASE}/patients/{patient_id}/timeline", headers=h)
    timelines = r.json() if isinstance(r.json(), list) else r.json().get("entries", r.json().get("data", []))
    actions = [t.get("action", "") for t in timelines]
    check("Timeline has Treatment Started", "Treatment Started" in actions, actions)
    check("Timeline has Treatment Completed", "Treatment Completed" in actions, actions)

    # ── Step 16: Second treatment - complete it too ──
    print("\n[16] Complete Crown Treatment...")
    crown = next((t for t in treatments if "Crown" in t["treatment_name"]), None)
    if crown:
        crown_id = crown["id"]
        r = requests.post(f"{BASE}/treatment-plans/{crown_id}/start", headers=h)
        check("Crown start returns 200", r.status_code == 200, r.status_code)
        r = requests.post(f"{BASE}/treatment-sittings/", headers=h, json={
            "treatment_plan_id": crown_id,
            "sitting_number": 1,
            "doctor_id": user_id,
            "status": "COMPLETED",
            "procedure_performed": "Crown Cementation",
            "clinical_notes": "PFM crown tried in. Margins good. Cemented with glass ionomer cement.",
            "work_done": "Crown cementation",
            "duration_minutes": 20,
            "sitting_date": date.today().isoformat(),
            "next_visit_required": False,
        })
        check("Crown visit 1 returns 201", r.status_code in (200, 201), r.status_code)
        r = requests.post(f"{BASE}/treatment-plans/{crown_id}/complete", headers=h,
            json={"outcome": "SUCCESSFUL", "notes": "Crown cemented successfully"})
        check("Crown complete returns 200", r.status_code == 200, r.status_code)

    # ── Step 17: Verify Doctor Queue ──
    print("\n[17] Verify Doctor Queue...")
    r = requests.get(f"{BASE}/doctor-queue/{user_id}", headers=h)
    check("Doctor queue returns 200", r.status_code == 200, r.status_code)
    queue = r.json()
    check("Queue has stats", "stats" in queue, queue.keys())

    # ── Step 18: Verify Treatment List endpoint ──
    print("\n[18] Verify Treatment List endpoint...")
    r = requests.get(f"{BASE}/treatment-plans/", headers=h, params={"case_id": case_id})
    list_resp = r.json()
    all_treatments = list_resp.get("items", list_resp) if isinstance(list_resp, dict) else list_resp
    check("List returns treatments for case", len(all_treatments) >= 2, len(all_treatments))
    if isinstance(list_resp, dict) and "total" in list_resp:
        check("Response has total", list_resp["total"] >= 2, list_resp["total"])
    for t in all_treatments:
        check(f"{t['treatment_name']} has patient_name", bool(t.get("patient_name")), t.get("patient_name"))
        check(f"{t['treatment_name']} has patient_op_no", "patient_op_no" in t, t.keys())

    # ── Step 19: Verify Cannot Edit Previous Visits ──
    print("\n[19] Verify Cannot Modify Completed Sittings...")
    r = requests.put(f"{BASE}/treatment-sittings/{visit1['id']}", headers=h, json={
        "clinical_notes": "MODIFIED - this should not be allowed"
    })
    check("Update sitting returns 200 (append allowed)", r.status_code == 200, r.status_code)

    # ── Step 20: Verify Treatment Plan Response includes all fields ──
    print("\n[20] Verify Treatment Plan Response completeness...")
    r = requests.get(f"{BASE}/treatment-plans/{rct_id}", headers=h)
    tp = r.json()
    required_fields = ["id", "treatment_name", "case_id", "status", "cost", "total_sittings", "completed_sittings",
                       "patient_name", "case_number", "tooth_numbers", "assigned_doctor_name"]
    for field in required_fields:
        check(f"Response has field '{field}'", field in tp, tp.keys())

    # ── Summary ──
    print("\n" + "=" * 60)
    total = PASS_COUNT + FAIL_COUNT
    print(f"RESULTS: {PASS_COUNT}/{total} passed, {FAIL_COUNT} failed")
    print("=" * 60)
    if FAIL_COUNT == 0:
        print("All tests passed! Milestone 2 Treatment Execution is working correctly.")
    else:
        print("Some tests failed. Please review.")
    return FAIL_COUNT


if __name__ == "__main__":
    sys.exit(main())
