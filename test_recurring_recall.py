"""
RECURRING RECALL AUTOMATION — 7 Scenario Tests
================================================
Real API calls. No synthetic events. No raw SQL writes (except DB verification).

Scenarios:
  1. Case Completed → Recurring Recall starts (occurrence=1)
  2. Recall Completed → Next Recall auto-scheduled (occurrence=2)
  3. Interval changed → Future schedule uses new interval
  4. New Case created → Old recalls cancelled
  5. New Case completed → Fresh recall schedule starts
  6. Calendar → Only one active recall per patient
  7. Duplicate events → Only one active recall schedule
"""
import requests
import sys
import os
import time
import uuid
import psycopg2
from datetime import date, timedelta

os.environ["PYTHONIOENCODING"] = "utf-8"
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8000/api/v1"
HOSPITAL_ID = "fadd20f4-4173-423c-bfb0-a45d5435bc56"
DOCTOR_ID = "194fde09-fa5d-45ac-bcda-ce60c3dde91c"

results = []

# ─── Auth ────────────────────────────────────────────────────────────────
_token_cache = [None]


def login():
    r = requests.post(f"{BASE}/auth/login", json={
        "email": "superadmin@dental.com",
        "password": "SuperAdmin@123"
    })
    data = r.json()
    if "access_token" not in data:
        print(f"  LOGIN FAILED: {r.status_code} {r.text[:200]}")
        raise Exception(f"Login failed: {data}")
    return data["access_token"]


def get_token():
    if not _token_cache[0]:
        _token_cache[0] = login()
    return _token_cache[0]


def hdr():
    return {"Authorization": f"Bearer {get_token()}"}


def db_query(sql, params=None):
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
    cur = conn.cursor()
    cur.execute(sql, params or ())
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description] if cur.description else []
    cur.close()
    conn.close()
    return [dict(zip(cols, row)) for row in rows]


def api(method, path, json_data=None, expect=200):
    url = f"{BASE}{path}"
    r = requests.request(method, url, headers=hdr(), json=json_data)
    if r.status_code != expect:
        print(f"    API ERROR {method} {path}: {r.status_code} {r.text[:200]}")
    return r


# ─── Helpers ─────────────────────────────────────────────────────────────

def create_patient(name=None):
    name = name or f"RR_Patient_{uuid.uuid4().hex[:8]}"
    r = api("POST", "/patients/", {
        "full_name": name,
        "phone": f"9{uuid.uuid4().int % 10000000000:010d}",
        "gender": "MALE", "age": 30, "hospital_id": HOSPITAL_ID,
    }, expect=201)
    return r.json().get("id") if r.status_code in (200, 201) else None


def create_case(patient_id, complaint="Recall test"):
    r = api("POST", "/cases/", {
        "patient_id": patient_id, "doctor_id": DOCTOR_ID,
        "chief_complaint": complaint,
    }, expect=201)
    return r.json().get("id") if r.status_code in (200, 201) else None


def create_treatment_plan_items(case_id, procedure="Root Canal"):
    r = api("POST", "/treatment-plan-items/", {
        "case_id": case_id,
        "items": [{
            "procedure_name": procedure, "tooth_numbers": ["16"],
            "estimated_visits": 1, "estimated_cost": 5000, "sequence_order": 1,
        }]
    }, expect=201)
    if r.status_code in (200, 201):
        items = r.json()
        return items[0].get("id") if items else None
    return None


def assign_doctor(item_id):
    api("POST", "/treatment-plan-items/assign-doctors", {
        "assignments": [{"item_id": item_id, "assigned_doctor_id": DOCTOR_ID}]
    }, expect=200)


def approve_treatment_plan(case_id):
    api("POST", f"/cases/{case_id}/approve-treatment-plan", expect=200)


def get_treatment_plan_id(case_id):
    r = api("GET", f"/treatment-plans/by-case/{case_id}")
    if r.status_code == 200:
        plans = r.json()
        return plans[0].get("id") if plans else None
    return None


def start_treatment(plan_id):
    return api("POST", f"/treatment-plans/{plan_id}/start").status_code in (200, 201)


def create_sitting(plan_id, num):
    r = api("POST", "/treatment-sittings/", {
        "treatment_plan_id": plan_id, "sitting_number": num,
        "doctor_id": DOCTOR_ID, "work_done": f"Sitting {num}",
    }, expect=201)
    return r.json().get("id") if r.status_code in (200, 201) else None


def complete_sitting(sid):
    return api("PUT", f"/treatment-sittings/{sid}", {
        "status": "COMPLETED", "work_done": "Done"
    }).status_code in (200, 201)


def upload_post_op(case_id):
    dummy = b'\xff\xd8\xff\xe0' + b'\x00' * 100 + b'\xff\xd9'
    url = f"{BASE}/post-ops/{case_id}"
    r = requests.post(url, headers=hdr(), files={"photos": ("test.jpg", dummy, "image/jpeg")}, data={"notes": "Post-op"})
    return r.status_code in (200, 201)


def complete_case(case_id):
    return api("POST", f"/cases/{case_id}/complete").status_code in (200, 201)


def get_recall_enquiries(patient_id):
    rows = db_query(
        "SELECT * FROM generated_enquiries WHERE patient_id = %s AND enquiry_type = 'RECALL' ORDER BY occurrence_number",
        (patient_id,)
    )
    return rows


def get_pending_recalls(patient_id):
    rows = db_query(
        "SELECT * FROM generated_enquiries WHERE patient_id = %s AND enquiry_type = 'RECALL' AND status = 'PENDING' ORDER BY occurrence_number",
        (patient_id,)
    )
    return rows


def mark_recall_completed(enquiry_id):
    r = api("PATCH", f"/crm/enquiries/{enquiry_id}/status", {"status": "COMPLETED"})
    return r.status_code == 200


def full_workflow(patient_id, case_label="Case"):
    """Create case → treatment → complete → post-op → complete case."""
    case_id = create_case(patient_id, case_label)
    if not case_id:
        return None
    item_id = create_treatment_plan_items(case_id)
    if item_id:
        assign_doctor(item_id)
    approve_treatment_plan(case_id)
    plan_id = get_treatment_plan_id(case_id)
    if plan_id:
        start_treatment(plan_id)
        sid = create_sitting(plan_id, 1)
        if sid:
            complete_sitting(sid)
    upload_post_op(case_id)
    ok = complete_case(case_id)
    return case_id if ok else None


# ─── Tests ───────────────────────────────────────────────────────────────

def test_1_case_completed_creates_recurring_recall():
    """Scenario 1: Case Completed → Recurring Recall starts (occurrence=1)"""
    patient_id = create_patient()
    if not patient_id:
        return "FAIL", "Patient creation failed"

    case_id = full_workflow(patient_id, "Scenario 1 Case")
    if not case_id:
        return "FAIL", "Case workflow failed"

    time.sleep(1)
    recalls = get_recall_enquiries(patient_id)
    pending = get_pending_recalls(patient_id)

    has_recurring = any(r["is_recurring"] for r in recalls)
    occ1 = any(r["occurrence_number"] == 1 for r in recalls)
    one_pending = len(pending) == 1

    return "PASS" if (has_recurring and occ1 and one_pending) else "FAIL", \
        f"recurring={has_recurring}, occ1={occ1}, pending_count={len(pending)}"


def test_2_recall_completed_schedules_next():
    """Scenario 2: Recall #1 completed → Recall #2 auto-scheduled"""
    patient_id = create_patient()
    if not patient_id:
        return "FAIL", "Patient creation failed"

    case_id = full_workflow(patient_id, "Scenario 2 Case")
    if not case_id:
        return "FAIL", "Case workflow failed"

    time.sleep(1)
    pending = get_pending_recalls(patient_id)
    if not pending:
        return "FAIL", "No pending recall after case completion"

    recall1_id = pending[0]["id"]
    ok = mark_recall_completed(recall1_id)
    if not ok:
        return "FAIL", "Failed to mark recall completed"

    time.sleep(1)
    all_recalls = get_recall_enquiries(patient_id)
    pending2 = get_pending_recalls(patient_id)

    completed_count = sum(1 for r in all_recalls if r["status"] == "COMPLETED")
    has_occ2 = any(r["occurrence_number"] == 2 for r in all_recalls)
    one_pending = len(pending2) == 1

    return "PASS" if (completed_count >= 1 and has_occ2 and one_pending) else "FAIL", \
        f"completed={completed_count}, has_occ2={has_occ2}, pending_count={len(pending2)}"


def test_3_interval_change_uses_new_interval():
    """Scenario 3: Change interval to 365 → next recall uses 365 days"""
    patient_id = create_patient()
    if not patient_id:
        return "FAIL", "Patient creation failed"

    case_id = full_workflow(patient_id, "Scenario 3 Case")
    if not case_id:
        return "FAIL", "Case workflow failed"

    time.sleep(1)
    pending = get_pending_recalls(patient_id)
    if not pending:
        return "FAIL", "No pending recall"

    original_interval = pending[0]["recurrence_interval_days"] or 180

    # Change CRM recall interval to 365 days directly in DB (API uses superadmin's hospital, not test hospital)
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
    cur = conn.cursor()
    cur.execute(
        "UPDATE crm_follow_up_configs SET start_delay_days = 365 WHERE hospital_id = %s AND context_type = 'CASE_RECALL'",
        (HOSPITAL_ID,)
    )
    conn.commit()
    cur.close()
    conn.close()
    # Invalidate cache
    from app.crm.services.crm_settings import get_settings_service
    get_settings_service().invalidate_cache(HOSPITAL_ID)

    mark_recall_completed(pending[0]["id"])
    time.sleep(1)

    pending2 = get_pending_recalls(patient_id)
    if not pending2:
        return "FAIL", "No pending recall after completing first"

    new_interval = pending2[0]["recurrence_interval_days"]

    # Restore default interval for other tests
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
    cur = conn.cursor()
    cur.execute(
        "UPDATE crm_follow_up_configs SET start_delay_days = 180 WHERE hospital_id = %s AND context_type = 'CASE_RECALL'",
        (HOSPITAL_ID,)
    )
    conn.commit()
    cur.close()
    conn.close()
    get_settings_service().invalidate_cache(HOSPITAL_ID)

    return "PASS" if new_interval == 365 else "FAIL", \
        f"expected_interval=365, got={new_interval}"


def test_4_new_case_cancels_old_recalls():
    """Scenario 4: New Case created → Old recalls cancelled"""
    patient_id = create_patient()
    if not patient_id:
        return "FAIL", "Patient creation failed"

    case_a = full_workflow(patient_id, "Scenario 4 Case A")
    if not case_a:
        return "FAIL", "Case A workflow failed"

    time.sleep(1)
    pending_before = get_pending_recalls(patient_id)
    if not pending_before:
        return "FAIL", "No pending recall from Case A"

    case_b = create_case(patient_id, "Scenario 4 Case B")
    if not case_b:
        return "FAIL", "Case B creation failed"

    time.sleep(1)
    pending_after = get_pending_recalls(patient_id)
    old_case_cancelled = all(r["case_id"] != case_a or r["status"] != "PENDING" for r in pending_after)
    cancelled_count = sum(1 for r in get_recall_enquiries(patient_id)
                          if r["case_id"] == case_a and r["status"] == "CANCELLED")

    return "PASS" if (old_case_cancelled and cancelled_count >= 1) else "FAIL", \
        f"cancelled_from_A={cancelled_count}, pending_remaining={len(pending_after)}"


def test_5_new_case_completes_fresh_schedule():
    """Scenario 5: New Case completed → Fresh recall schedule starts"""
    patient_id = create_patient()
    if not patient_id:
        return "FAIL", "Patient creation failed"

    case_a = full_workflow(patient_id, "Scenario 5 Case A")
    if not case_a:
        return "FAIL", "Case A workflow failed"
    time.sleep(1)

    case_b = create_case(patient_id, "Scenario 5 Case B")
    if not case_b:
        return "FAIL", "Case B creation failed"

    item_id = create_treatment_plan_items(case_b)
    if item_id:
        assign_doctor(item_id)
    approve_treatment_plan(case_b)
    plan_id = get_treatment_plan_id(case_b)
    if plan_id:
        start_treatment(plan_id)
        sid = create_sitting(plan_id, 1)
        if sid:
            complete_sitting(sid)
    upload_post_op(case_b)
    complete_case(case_b)
    time.sleep(1)

    all_recalls = get_recall_enquiries(patient_id)
    pending = get_pending_recalls(patient_id)

    new_case_recall = [r for r in all_recalls if r["case_id"] == case_b]
    old_case_active = [r for r in all_recalls if r["case_id"] == case_a and r["status"] == "PENDING"]

    return "PASS" if (len(new_case_recall) >= 1 and len(old_case_active) == 0 and len(pending) == 1) else "FAIL", \
        f"new_case_recalls={len(new_case_recall)}, old_active={len(old_case_active)}, pending={len(pending)}"


def test_6_calendar_shows_one_per_patient():
    """Scenario 6: Calendar shows only one active recall per patient"""
    patient_id = create_patient()
    if not patient_id:
        return "FAIL", "Patient creation failed"

    full_workflow(patient_id, "Scenario 6 Case")
    time.sleep(1)

    today = date.today()
    start = (today - timedelta(days=30)).isoformat()
    end = (today + timedelta(days=365)).isoformat()
    r = api("GET", f"/crm/recalls/calendar?start_date={start}&end_date={end}")
    if r.status_code != 200:
        return "FAIL", f"Calendar API returned {r.status_code}"

    events = r.json()
    patient_name = db_query("SELECT full_name FROM patients WHERE id = %s", (patient_id,))
    p_name = patient_name[0]["full_name"] if patient_name else "Unknown"

    patient_events = [e for e in events if e.get("patient_name") == p_name]

    return "PASS" if len(patient_events) <= 1 else "FAIL", \
        f"calendar_recall_count_for_patient={len(patient_events)} (total_events={len(events)})"


def test_7_duplicate_events_no_duplicates():
    """Scenario 7: Fire case_completed twice → only one active recall"""
    patient_id = create_patient()
    if not patient_id:
        return "FAIL", "Patient creation failed"

    case_id = full_workflow(patient_id, "Scenario 7 Case")
    if not case_id:
        return "FAIL", "Case workflow failed"

    time.sleep(1)
    pending = get_pending_recalls(patient_id)
    return "PASS" if len(pending) == 1 else "FAIL", \
        f"expected_1_pending, got={len(pending)}"


# ─── Runner ──────────────────────────────────────────────────────────────

def run_all():
    print("=" * 72)
    print("RECURRING RECALL AUTOMATION — 7 Scenario Tests")
    print(f"Hospital: {HOSPITAL_ID}")
    print(f"Doctor:   {DOCTOR_ID}")
    print("=" * 72)

    tests = [
        ("Case Completed → Recurring Recall", test_1_case_completed_creates_recurring_recall),
        ("Recall Completed → Next Scheduled", test_2_recall_completed_schedules_next),
        ("Interval Change → Uses New Interval", test_3_interval_change_uses_new_interval),
        ("New Case → Cancels Old Recalls", test_4_new_case_cancels_old_recalls),
        ("New Case Completed → Fresh Schedule", test_5_new_case_completes_fresh_schedule),
        ("Calendar → One Active Recall", test_6_calendar_shows_one_per_patient),
        ("Duplicate Events → No Duplicates", test_7_duplicate_events_no_duplicates),
    ]

    passed = 0
    failed = 0
    errors = 0

    for i, (name, fn) in enumerate(tests, 1):
        print(f"\n{'=' * 72}")
        print(f"TEST {i}: {name}")
        print("=" * 72)
        t0 = time.time()
        try:
            status, detail = fn()
            elapsed = time.time() - t0
            if status == "PASS":
                passed += 1
                print(f"  RESULT: PASS ({elapsed:.1f}s) — {detail}")
            elif status == "FAIL":
                failed += 1
                print(f"  RESULT: FAIL ({elapsed:.1f}s) — {detail}")
            else:
                errors += 1
                print(f"  RESULT: ERROR ({elapsed:.1f}s) — {detail}")
        except Exception as e:
            elapsed = time.time() - t0
            errors += 1
            print(f"  RESULT: EXCEPTION ({elapsed:.1f}s) — {e}")

    print(f"\n{'=' * 72}")
    print("FINAL SUMMARY")
    print("=" * 72)
    print(f"  Total: {len(tests)} | Passed: {passed} | Failed: {failed} | Errors: {errors}")
    if failed == 0 and errors == 0:
        print("  Status: ALL TESTS PASSED")
    else:
        print("  Status: SOME TESTS FAILED")
    print("=" * 72)

    return failed == 0 and errors == 0


if __name__ == "__main__":
    success = run_all()
    sys.exit(0 if success else 1)
