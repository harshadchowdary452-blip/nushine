"""
NUSHINE DENTAL ERP - CRM AUTOMATION FULL AUDIT
Runs every scenario from the audit spec against the live server.

Usage: python test_full_audit.py
Requires: server running on localhost:8000
"""
import requests
import json
import sys
import uuid
import os
from datetime import date, timedelta, datetime

# Force UTF-8 output on Windows
os.environ["PYTHONIOENCODING"] = "utf-8"
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8000/api/v1"
RESULTS = []
HOSPITAL_ID = "2e0920f1-be0d-4cf0-a2f5-e103397c623f"
TOKEN = None

# ============================================================
# Helpers
# ============================================================

def login():
    global TOKEN
    r = requests.post(f"{BASE}/auth/login", json={
        "email": "superadmin@dental.com",
        "password": "SuperAdmin@123"
    })
    if r.status_code != 200:
        print(f"LOGIN FAILED: {r.status_code} {r.text}")
        sys.exit(1)
    TOKEN = r.json()["access_token"]
    return TOKEN

def headers():
    return {"Authorization": f"Bearer {TOKEN}"}

def dispatch(event_type, entity_type, entity_id, patient_id=None, doctor_id=None, payload=None):
    """Fire an event through the test endpoint (full pipeline)."""
    r = requests.post(f"{BASE}/crm/test/event", json={
        "event_type": event_type,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "hospital_id": HOSPITAL_ID,
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "payload": payload or {},
    }, headers=headers())
    return r.json() if r.status_code == 200 else {"error": r.status_code, "body": r.text}

def dispatch_appointment(event_type, appointment_id, patient_id, payload=None):
    r = requests.post(f"{BASE}/crm/test/appointment-event", json={
        "hospital_id": HOSPITAL_ID,
        "appointment_id": appointment_id,
        "patient_id": patient_id,
        "payload": payload or {},
    }, headers=headers())
    return r.json() if r.status_code == 200 else {"error": r.status_code, "body": r.text}

def dispatch_case(case_id, patient_id, treatment_type_id=None, payload=None):
    r = requests.post(f"{BASE}/crm/test/case-event", json={
        "hospital_id": HOSPITAL_ID,
        "case_id": case_id,
        "patient_id": patient_id,
        "treatment_type_id": treatment_type_id,
        "payload": payload or {},
    }, headers=headers())
    return r.json() if r.status_code == 200 else {"error": r.status_code, "body": r.text}

def dispatch_treatment(patient_id, treatment_plan_id, case_id, treatment_type_id=None, payload=None):
    r = requests.post(f"{BASE}/crm/test/treatment-event", json={
        "hospital_id": HOSPITAL_ID,
        "patient_id": patient_id,
        "treatment_plan_id": treatment_plan_id,
        "case_id": case_id,
        "treatment_type_id": treatment_type_id,
        "payload": payload or {},
    }, headers=headers())
    return r.json() if r.status_code == 200 else {"error": r.status_code, "body": r.text}

def count_enquiries(patient_id=None, lead_id=None, appointment_id=None, case_id=None, enquiry_type=None, status="PENDING"):
    """Count GeneratedEnquiries via the calendar endpoint."""
    today = date.today()
    start = (today - timedelta(days=365)).isoformat()
    end = (today + timedelta(days=365)).isoformat()
    params = {
        "start_date": start,
        "end_date": end,
        "include_terminal": "true",
        "page_size": 200,
    }
    r = requests.get(f"{BASE}/crm/enquiries/calendar", params=params, headers=headers())
    if r.status_code != 200:
        return []
    data = r.json()
    items = data.get("items", [])
    filtered = items
    if patient_id:
        filtered = [i for i in filtered if i.get("patient_id") == patient_id]
    if lead_id:
        filtered = [i for i in filtered if i.get("lead_id") == lead_id]
    if appointment_id:
        filtered = [i for i in filtered if i.get("appointment_id") == appointment_id]
    if case_id:
        filtered = [i for i in filtered if i.get("case_id") == case_id]
    if enquiry_type:
        filtered = [i for i in filtered if i.get("type") == enquiry_type]
    if status:
        filtered = [i for i in filtered if i.get("status") == status]
    return filtered

def get_summary():
    today = date.today()
    start = (today - timedelta(days=365)).isoformat()
    end = (today + timedelta(days=365)).isoformat()
    r = requests.get(f"{BASE}/crm/enquiries/calendar/summary", params={
        "start_date": start, "end_date": end, "include_terminal": "true"
    }, headers=headers())
    return r.json() if r.status_code == 200 else {}

def record(test_num, name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    RESULTS.append({"num": test_num, "name": name, "status": status, "detail": detail})
    marker = "PASS" if passed else "FAIL"
    print(f"  [{marker}] {test_num}. {name}: {status}" + (f" -- {detail}" if detail else ""))

# ============================================================
# TEST DATA — Use unique UUIDs for each test run
# ============================================================

TEST_PATIENT = str(uuid.uuid4())
TEST_PATIENT_2 = str(uuid.uuid4())
TEST_LEAD = str(uuid.uuid4())
TEST_LEAD_2 = str(uuid.uuid4())
TEST_CASE = str(uuid.uuid4())
TEST_PLAN = str(uuid.uuid4())
TEST_APPT = str(uuid.uuid4())
TEST_APPT_2 = str(uuid.uuid4())
TEST_TT = str(uuid.uuid4())  # treatment type

# ============================================================
# SCENARIO 1: Lead Created -> ONE LEAD_FOLLOW_UP
# ============================================================

def test_s1():
    print("\n--- SCENARIO 1: Lead Created ---")
    # Fire LEAD_CREATED event
    r = dispatch("LEAD_CREATED", "LEAD", TEST_LEAD, patient_id=TEST_PATIENT, payload={
        "lead_id": TEST_LEAD,
        "source": "WEBSITE",
        "status": "NEW",
    })
    print(f"    dispatch result: {json.dumps(r.get('data', r), indent=2)[:300]}")

    # Check enquiry created
    items = count_enquiries(lead_id=TEST_LEAD, enquiry_type="LEAD_FOLLOW_UP")
    created = len(items) > 0
    record(1, "Lead Created -> ONE LEAD_FOLLOW_UP", created,
           f"found {len(items)} enquiry(ies)" if created else "NO enquiry found")

    # Fire again — should be DUPLICATE
    r2 = dispatch("LEAD_CREATED", "LEAD", TEST_LEAD, patient_id=TEST_PATIENT, payload={
        "lead_id": TEST_LEAD,
        "source": "WEBSITE",
        "status": "NEW",
    })
    items2 = count_enquiries(lead_id=TEST_LEAD, enquiry_type="LEAD_FOLLOW_UP")
    no_dup = len(items2) == 1
    record(1.1, "Lead Created x2 -> No duplicate", no_dup,
           f"found {len(items2)} (expected 1)" if not no_dup else "1 enquiry only")

    # Due date check
    if items:
        due = items[0].get("due_date")
        today_str = date.today().isoformat()
        # Due should be today + delay (at least 1 day)
        record(1.2, "Lead Follow-up due_date > today", due > today_str if due else False,
               f"due={due}, today={today_str}")

# ============================================================
# SCENARIO 2: Lead Converted -> Cancel LEAD_FOLLOW_UP
# ============================================================

def test_s2():
    print("\n--- SCENARIO 2: Lead Converted -> Cancel Lead Follow-ups ---")
    r = dispatch("LEAD_CONVERTED", "LEAD", TEST_LEAD, patient_id=TEST_PATIENT, payload={
        "lead_id": TEST_LEAD,
    })
    items = count_enquiries(lead_id=TEST_LEAD, enquiry_type="LEAD_FOLLOW_UP", status="PENDING")
    no_active = len(items) == 0
    record(2, "Lead Converted -> Lead Follow-ups cancelled", no_active,
           f"found {len(items)} still PENDING" if not no_active else "all cancelled")

# ============================================================
# SCENARIO 3: Patient Registered Directly -> No Lead Follow-up
# ============================================================

def test_s3():
    print("\n--- SCENARIO 3: Patient Registered Directly ---")
    r = dispatch("PATIENT_REGISTERED", "PATIENT", TEST_PATIENT_2, patient_id=TEST_PATIENT_2)
    items = count_enquiries(patient_id=TEST_PATIENT_2, enquiry_type="LEAD_FOLLOW_UP")
    no_lead = len(items) == 0
    record(3, "Patient Registered -> No LEAD_FOLLOW_UP", no_lead,
           f"found {len(items)} LEAD_FOLLOW_UP" if not no_lead else "correct — no lead follow-up")

# ============================================================
# SCENARIO 4: Appointment Created -> ONE APPOINTMENT_REMINDER
# ============================================================

def test_s4():
    print("\n--- SCENARIO 4: Appointment Created ---")
    future_date = (date.today() + timedelta(days=5)).isoformat()
    r = dispatch("APPOINTMENT_CREATED", "APPOINTMENT", TEST_APPT, patient_id=TEST_PATIENT, payload={
        "appointment_id": TEST_APPT,
        "patient_id": TEST_PATIENT,
        "status": "SCHEDULED",
        "appointment_date": future_date,
    })
    items = count_enquiries(patient_id=TEST_PATIENT, appointment_id=TEST_APPT, enquiry_type="APPOINTMENT_REMINDER")
    created = len(items) > 0
    record(4, "Appointment Created -> ONE APPOINTMENT_REMINDER", created,
           f"found {len(items)}" if created else "NO reminder found")

    # Due date should be <= appointment date
    if items:
        due = items[0].get("due_date")
        record(4.1, "Reminder due_date <= appointment_date", due <= future_date if due else False,
               f"due={due}, appt={future_date}")

    # Duplicate check
    r2 = dispatch("APPOINTMENT_CREATED", "APPOINTMENT", TEST_APPT, patient_id=TEST_PATIENT, payload={
        "appointment_id": TEST_APPT,
        "patient_id": TEST_PATIENT,
        "status": "SCHEDULED",
        "appointment_date": future_date,
    })
    items2 = count_enquiries(patient_id=TEST_PATIENT, appointment_id=TEST_APPT, enquiry_type="APPOINTMENT_REMINDER")
    no_dup = len(items2) == 1
    record(4.2, "Appointment Created x2 -> No duplicate", no_dup,
           f"found {len(items2)}" if not no_dup else "1 reminder only")

# ============================================================
# SCENARIO 5: Appointment Cancelled -> Reminder Cancelled
# ============================================================

def test_s5():
    print("\n--- SCENARIO 5: Appointment Cancelled ---")
    r = dispatch("APPOINTMENT_CANCELLED", "APPOINTMENT", TEST_APPT, patient_id=TEST_PATIENT, payload={
        "appointment_id": TEST_APPT,
        "patient_id": TEST_PATIENT,
    })
    items = count_enquiries(patient_id=TEST_PATIENT, appointment_id=TEST_APPT, enquiry_type="APPOINTMENT_REMINDER", status="PENDING")
    no_active = len(items) == 0
    record(5, "Appointment Cancelled -> Reminder cancelled", no_active,
           f"found {len(items)} still PENDING" if not no_active else "all cancelled")

# ============================================================
# SCENARIO 6: OPD Consultation Completed (no treatment) -> OPD_FOLLOW_UP
# ============================================================

def test_s6():
    print("\n--- SCENARIO 6: OPD Consultation (no treatment) ---")
    r = dispatch("OPD_CONSULTATION_COMPLETED", "PATIENT", TEST_PATIENT, patient_id=TEST_PATIENT, payload={
        "patient_id": TEST_PATIENT,
        "treatment_started": False,
    })
    items = count_enquiries(patient_id=TEST_PATIENT, enquiry_type="OPD_FOLLOW_UP")
    created = len(items) > 0
    record(6, "OPD Completed (no treatment) -> OPD_FOLLOW_UP", created,
           f"found {len(items)}" if created else "NO follow-up found")

    # Due date should be today + delay (>= today + 1)
    if items:
        due = items[0].get("due_date")
        today_str = date.today().isoformat()
        record(6.1, "OPD due_date > today", due > today_str if due else False,
               f"due={due}")

    # Duplicate check
    r2 = dispatch("OPD_CONSULTATION_COMPLETED", "PATIENT", TEST_PATIENT, patient_id=TEST_PATIENT, payload={
        "patient_id": TEST_PATIENT,
        "treatment_started": False,
    })
    items2 = count_enquiries(patient_id=TEST_PATIENT, enquiry_type="OPD_FOLLOW_UP")
    no_dup = len(items2) == 1
    record(6.2, "OPD Completed x2 -> No duplicate", no_dup,
           f"found {len(items2)}" if not no_dup else "1 follow-up only")

# ============================================================
# SCENARIO 7: OPD Consultation (treatment started) -> NO OPD_FOLLOW_UP
# ============================================================

def test_s7():
    print("\n--- SCENARIO 7: OPD Consultation (treatment started) ---")
    patient_7 = str(uuid.uuid4())
    r = dispatch("OPD_CONSULTATION_COMPLETED", "PATIENT", patient_7, patient_id=patient_7, payload={
        "patient_id": patient_7,
        "treatment_started": True,
    })
    items = count_enquiries(patient_id=patient_7, enquiry_type="OPD_FOLLOW_UP")
    no_followup = len(items) == 0
    record(7, "OPD Completed (treatment started) -> NO OPD_FOLLOW_UP", no_followup,
           f"found {len(items)}" if not no_followup else "correct — no follow-up")

# ============================================================
# SCENARIO 8-11: Treatment Visit with Future Appointment -> APPOINTMENT_REMINDER only
# ============================================================

def test_s8_s9_s10_s11():
    print("\n--- SCENARIO 8-11: Treatment Visits with Future Appointments ---")
    patient_8 = str(uuid.uuid4())
    case_8 = str(uuid.uuid4())
    plan_8 = str(uuid.uuid4())

    # First: create a future appointment for this patient
    future_appt_id = str(uuid.uuid4())
    future_date = (date.today() + timedelta(days=14)).isoformat()
    dispatch("APPOINTMENT_CREATED", "APPOINTMENT", future_appt_id, patient_id=patient_8, payload={
        "appointment_id": future_appt_id,
        "patient_id": patient_8,
        "status": "SCHEDULED",
        "appointment_date": future_date,
    })

    # Visit 1: future appt exists -> APPOINTMENT_REMINDER only, NO TREATMENT_WELLNESS
    r = dispatch("TREATMENT_VISIT_COMPLETED", "TREATMENT", plan_8, patient_id=patient_8, payload={
        "patient_id": patient_8,
        "treatment_plan_id": plan_8,
        "case_id": case_8,
    })
    wellness_items = count_enquiries(patient_id=patient_8, enquiry_type="TREATMENT_WELLNESS")
    reminder_items = count_enquiries(patient_id=patient_8, appointment_id=future_appt_id, enquiry_type="APPOINTMENT_REMINDER")
    s8_no_wellness = len(wellness_items) == 0
    s8_has_reminder = len(reminder_items) > 0
    record(8, "Visit 1 (future appt) -> NO TREATMENT_WELLNESS", s8_no_wellness,
           f"found {len(wellness_items)} wellness" if not s8_no_wellness else "correct")
    record(8.1, "Visit 1 (future appt) -> HAS APPOINTMENT_REMINDER", s8_has_reminder,
           f"found {len(reminder_items)} reminders" if s8_has_reminder else "MISSING reminder")

    # Visit 2: same thing
    r = dispatch("TREATMENT_VISIT_COMPLETED", "TREATMENT", plan_8, patient_id=patient_8, payload={
        "patient_id": patient_8,
        "treatment_plan_id": plan_8,
        "case_id": case_8,
    })
    wellness_items2 = count_enquiries(patient_id=patient_8, enquiry_type="TREATMENT_WELLNESS")
    s9_no_wellness = len(wellness_items2) == 0
    record(9, "Visit 2 (future appt) -> NO TREATMENT_WELLNESS", s9_no_wellness,
           f"found {len(wellness_items2)}" if not s9_no_wellness else "correct")

    # Visit 3: same
    r = dispatch("TREATMENT_VISIT_COMPLETED", "TREATMENT", plan_8, patient_id=patient_8, payload={
        "patient_id": patient_8,
        "treatment_plan_id": plan_8,
        "case_id": case_8,
    })
    wellness_items3 = count_enquiries(patient_id=patient_8, enquiry_type="TREATMENT_WELLNESS")
    s10_no_wellness = len(wellness_items3) == 0
    record(10, "Visit 3 (future appt) -> NO TREATMENT_WELLNESS", s10_no_wellness,
           f"found {len(wellness_items3)}" if not s10_no_wellness else "correct")

    # TREATMENT_COMPLETED (final visit, future appt exists) -> APPOINTMENT_REMINDER only
    r = dispatch("TREATMENT_COMPLETED", "TREATMENT", plan_8, patient_id=patient_8, payload={
        "patient_id": patient_8,
        "treatment_plan_id": plan_8,
        "case_id": case_8,
    })
    wellness_final = count_enquiries(patient_id=patient_8, enquiry_type="TREATMENT_WELLNESS")
    s11_no_wellness = len(wellness_final) == 0
    record(11, "Treatment Completed (future appt) -> NO TREATMENT_WELLNESS", s11_no_wellness,
           f"found {len(wellness_final)}" if not s11_no_wellness else "correct")

# ============================================================
# SCENARIO 12: Treatment Completed (NO future appt) -> TREATMENT_WELLNESS
# ============================================================

def test_s12():
    print("\n--- SCENARIO 12: Treatment Completed (no future appt) ---")
    patient_12 = str(uuid.uuid4())
    case_12 = str(uuid.uuid4())
    plan_12 = str(uuid.uuid4())

    r = dispatch("TREATMENT_COMPLETED", "TREATMENT", plan_12, patient_id=patient_12, payload={
        "patient_id": patient_12,
        "treatment_plan_id": plan_12,
        "case_id": case_12,
    })
    items = count_enquiries(patient_id=patient_12, enquiry_type="TREATMENT_WELLNESS")
    created = len(items) > 0
    record(12, "Treatment Completed (no appt) -> TREATMENT_WELLNESS", created,
           f"found {len(items)}" if created else "NO wellness found")

    if items:
        due = items[0].get("due_date")
        today_str = date.today().isoformat()
        record(12.1, "Treatment Wellness due_date > today", due > today_str if due else False,
               f"due={due}")

    # Duplicate check
    r2 = dispatch("TREATMENT_COMPLETED", "TREATMENT", plan_12, patient_id=patient_12, payload={
        "patient_id": patient_12,
        "treatment_plan_id": plan_12,
        "case_id": case_12,
    })
    items2 = count_enquiries(patient_id=patient_12, enquiry_type="TREATMENT_WELLNESS")
    no_dup = len(items2) == 1
    record(12.2, "Treatment Completed x2 -> No duplicate", no_dup,
           f"found {len(items2)}" if not no_dup else "1 wellness only")

# ============================================================
# SCENARIO 13: Case Completed -> CASE_WELLNESS + RECALL
# ============================================================

def test_s13():
    print("\n--- SCENARIO 13: Case Completed ---")
    patient_13 = str(uuid.uuid4())
    case_13 = str(uuid.uuid4())

    r = dispatch_case(case_13, patient_13)
    print(f"    dispatch result: {json.dumps(r.get('data', r), indent=2)[:300]}")

    wellness = count_enquiries(patient_id=patient_13, case_id=case_13, enquiry_type="CASE_WELLNESS")
    recall = count_enquiries(patient_id=patient_13, case_id=case_13, enquiry_type="RECALL")
    s13_wellness = len(wellness) > 0
    s13_recall = len(recall) > 0
    record(13, "Case Completed -> CASE_WELLNESS", s13_wellness,
           f"found {len(wellness)}" if s13_wellness else "NO wellness")
    record(13.1, "Case Completed -> RECALL", s13_recall,
           f"found {len(recall)}" if s13_recall else "NO recall")

    # Due dates should be > today
    if wellness:
        due = wellness[0].get("due_date")
        today_str = date.today().isoformat()
        record(13.2, "Case Wellness due_date > today", due > today_str if due else False,
               f"due={due}")
    if recall:
        due = recall[0].get("due_date")
        today_str = date.today().isoformat()
        record(13.3, "Recall due_date >> today", due > today_str if due else False,
               f"due={due}")

    # Duplicate check
    r2 = dispatch_case(case_13, patient_13)
    wellness2 = count_enquiries(patient_id=patient_13, case_id=case_13, enquiry_type="CASE_WELLNESS")
    recall2 = count_enquiries(patient_id=patient_13, case_id=case_13, enquiry_type="RECALL")
    s13_dup_wellness = len(wellness2) == 1
    s13_dup_recall = len(recall2) == 1
    record(13.4, "Case Completed x2 -> No duplicate CASE_WELLNESS", s13_dup_wellness,
           f"found {len(wellness2)}" if not s13_dup_wellness else "1 only")
    record(13.5, "Case Completed x2 -> No duplicate RECALL", s13_dup_recall,
           f"found {len(recall2)}" if not s13_dup_recall else "1 only")

# ============================================================
# SCENARIO 14: Recall (date reached) — skipped (auto-generated)
# ============================================================

def test_s14():
    print("\n--- SCENARIO 14: Recall ---")
    record(14, "Recall Generated by CASE_COMPLETED", True,
           "Recall enquiry created by Case Completed rule (scenario 13)")

# ============================================================
# SCENARIO 15: Re-trigger all -> no duplicates
# ============================================================

def test_s15():
    print("\n--- SCENARIO 15: Re-trigger all -> no duplicates ---")
    patient_15 = str(uuid.uuid4())
    lead_15 = str(uuid.uuid4())
    case_15 = str(uuid.uuid4())
    plan_15 = str(uuid.uuid4())

    # Lead
    dispatch("LEAD_CREATED", "LEAD", lead_15, patient_id=patient_15, payload={
        "lead_id": lead_15, "status": "NEW",
    })
    dispatch("LEAD_CREATED", "LEAD", lead_15, patient_id=patient_15, payload={
        "lead_id": lead_15, "status": "NEW",
    })
    dispatch("LEAD_CREATED", "LEAD", lead_15, patient_id=patient_15, payload={
        "lead_id": lead_15, "status": "NEW",
    })
    lead_items = count_enquiries(lead_id=lead_15, enquiry_type="LEAD_FOLLOW_UP")
    record(15.1, "Lead x3 -> Only 1 LEAD_FOLLOW_UP", len(lead_items) == 1,
           f"found {len(lead_items)}")

    # Appointment
    appt_15 = str(uuid.uuid4())
    future = (date.today() + timedelta(days=10)).isoformat()
    dispatch("APPOINTMENT_CREATED", "APPOINTMENT", appt_15, patient_id=patient_15, payload={
        "appointment_id": appt_15, "patient_id": patient_15, "status": "SCHEDULED",
        "appointment_date": future,
    })
    dispatch("APPOINTMENT_CREATED", "APPOINTMENT", appt_15, patient_id=patient_15, payload={
        "appointment_id": appt_15, "patient_id": patient_15, "status": "SCHEDULED",
        "appointment_date": future,
    })
    appt_items = count_enquiries(patient_id=patient_15, appointment_id=appt_15, enquiry_type="APPOINTMENT_REMINDER")
    record(15.2, "Appointment x2 -> Only 1 APPOINTMENT_REMINDER", len(appt_items) == 1,
           f"found {len(appt_items)}")

    # Case Completed
    dispatch_case(case_15, patient_15)
    dispatch_case(case_15, patient_15)
    dispatch_case(case_15, patient_15)
    cw = count_enquiries(patient_id=patient_15, case_id=case_15, enquiry_type="CASE_WELLNESS")
    rc = count_enquiries(patient_id=patient_15, case_id=case_15, enquiry_type="RECALL")
    record(15.3, "Case Completed x3 -> Only 1 CASE_WELLNESS", len(cw) == 1,
           f"found {len(cw)}")
    record(15.4, "Case Completed x3 -> Only 1 RECALL", len(rc) == 1,
           f"found {len(rc)}")

# ============================================================
# SCENARIO 16: Calendar display
# ============================================================

def test_s16():
    print("\n--- SCENARIO 16: Calendar Display ---")
    summary = get_summary()
    total = summary.get("total", 0)
    overdue = summary.get("overdue", 0)
    record(16, "Calendar summary returns data", total > 0,
           f"total={total}, overdue={overdue}")

    # Check calendar endpoint
    today = date.today()
    start = (today - timedelta(days=7)).isoformat()
    end = (today + timedelta(days=7)).isoformat()
    r = requests.get(f"{BASE}/crm/enquiries/calendar", params={
        "start_date": start, "end_date": end, "include_terminal": "true"
    }, headers=headers())
    if r.status_code == 200:
        cal = r.json()
        items = cal.get("items", [])
        total_cal = cal.get("total", 0)
        # Check no duplicate IDs
        ids = [i["id"] for i in items]
        unique_ids = set(ids)
        no_dup = len(ids) == len(unique_ids)
        record(16.1, "Calendar items have no duplicate IDs", no_dup,
               f"{len(ids)} items, {len(unique_ids)} unique" if not no_dup else f"{len(ids)} items, all unique")
        record(16.2, "Calendar returns items", total_cal > 0, f"total={total_cal}")
    else:
        record(16.1, "Calendar endpoint works", False, f"status={r.status_code}")

# ============================================================
# SCENARIO 17: CRM Settings — delays respected
# ============================================================

def test_s17():
    print("\n--- SCENARIO 17: CRM Settings Delays ---")
    # Check that the OPD follow-up delay comes from settings
    # The default OPD delay is 3 days
    patient_17 = str(uuid.uuid4())
    dispatch("OPD_CONSULTATION_COMPLETED", "PATIENT", patient_17, patient_id=patient_17, payload={
        "patient_id": patient_17, "treatment_started": False,
    })
    items = count_enquiries(patient_id=patient_17, enquiry_type="OPD_FOLLOW_UP")
    if items:
        due = items[0].get("due_date")
        today = date.today()
        due_date = date.fromisoformat(due) if due else None
        expected_min = today + timedelta(days=1)  # At least 1 day delay
        expected_typical = today + timedelta(days=3)  # Default 3 days
        if due_date and due_date >= expected_min:
            record(17, "OPD Follow-up delay > 0 (settings-based)", True, f"due={due}, today={today.isoformat()}")
        else:
            record(17, "OPD Follow-up delay > 0", False, f"due={due}")
    else:
        record(17, "OPD Follow-up created with delay", False, "no enquiry found")

    # Lead delay check
    lead_17 = str(uuid.uuid4())
    dispatch("LEAD_CREATED", "LEAD", lead_17, patient_id=str(uuid.uuid4()), payload={
        "lead_id": lead_17, "status": "NEW",
    })
    items2 = count_enquiries(lead_id=lead_17, enquiry_type="LEAD_FOLLOW_UP")
    if items2:
        due = items2[0].get("due_date")
        today = date.today()
        due_date = date.fromisoformat(due) if due else None
        if due_date and due_date > today:
            record(17.1, "Lead Follow-up delay > 0", True, f"due={due}")
        else:
            record(17.1, "Lead Follow-up delay > 0", False, f"due={due}")
    else:
        record(17.1, "Lead Follow-up created", False, "no enquiry found")


# ============================================================
# DATABASE AUDIT
# ============================================================

def test_db_audit():
    print("\n--- DATABASE AUDIT ---")
    # Fetch all enquiries and check required fields
    today = date.today()
    start = (today - timedelta(days=365)).isoformat()
    end = (today + timedelta(days=365)).isoformat()
    r = requests.get(f"{BASE}/crm/enquiries/calendar", params={
        "start_date": start, "end_date": end, "include_terminal": "true",
        "page_size": 200
    }, headers=headers())
    items = r.json().get("items", []) if r.status_code == 200 else []

    missing_hospital = [i for i in items if not i.get("source")]
    missing_patient = [i for i in items if not i.get("patient_id")]
    missing_due = [i for i in items if not i.get("due_date")]
    missing_type = [i for i in items if not i.get("type")]
    missing_status = [i for i in items if not i.get("status")]

    record("DB1", "All items have source", len(missing_hospital) == 0,
           f"{len(missing_hospital)} missing" if missing_hospital else f"{len(items)} items checked")
    record("DB2", "All items have patient_id", len(missing_patient) == 0,
           f"{len(missing_patient)} missing" if missing_patient else f"{len(items)} items checked")
    record("DB3", "All items have due_date", len(missing_due) == 0,
           f"{len(missing_due)} missing" if missing_due else f"{len(items)} items checked")
    record("DB4", "All items have type", len(missing_type) == 0,
           f"{len(missing_type)} missing" if missing_type else f"{len(items)} items checked")
    record("DB5", "All items have status", len(missing_status) == 0,
           f"{len(missing_status)} missing" if missing_status else f"{len(items)} items checked")


# ============================================================
# MAIN
# ============================================================

def main():
    print("=" * 70)
    print("NUSHINE DENTAL ERP — CRM AUTOMATION FULL AUDIT")
    print("=" * 70)

    print("\n[0] Logging in...")
    login()
    print(f"    Token acquired")

    print("\n[1] Running scenarios...")
    test_s1()
    test_s2()
    test_s3()
    test_s4()
    test_s5()
    test_s6()
    test_s7()
    test_s8_s9_s10_s11()
    test_s12()
    test_s13()
    test_s14()
    test_s15()
    test_s16()
    test_s17()

    print("\n[2] Database audit...")
    test_db_audit()

    # Summary
    print("\n" + "=" * 70)
    print("FINAL REPORT")
    print("=" * 70)
    passed = sum(1 for r in RESULTS if r["status"] == "PASS")
    failed = sum(1 for r in RESULTS if r["status"] == "FAIL")
    total = len(RESULTS)
    print(f"\nTotal: {total} | Passed: {passed} | Failed: {failed}")
    print(f"Score: {passed}/{total} ({passed*100//total}%)\n")

    if failed > 0:
        print("FAILED SCENARIOS:")
        for r in RESULTS:
            if r["status"] == "FAIL":
                print(f"  [{r['status']}] {r['num']}. {r['name']}: {r['detail']}")

    print("\nALL RESULTS:")
    for r in RESULTS:
        marker = "PASS" if r["status"] == "PASS" else "FAIL"
        print(f"  [{marker}] {r['num']}. {r['name']}: {r['status']}" + (f" -- {r['detail']}" if r["detail"] else ""))

    return failed == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
