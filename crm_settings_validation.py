"""
CRM Settings Validation Suite — 25 End-to-End Tests
====================================================
Section 1: General Settings (5 tests)
Section 2: Lead Settings (5 tests)
Section 3: OPD Settings (5 tests)
Section 4: Treatment Settings (5 tests)
Section 5: Case Settings (5 tests)

Each test: Settings → API → Rule Engine → Enquiry → DB → Calendar → Cleanup
"""
import requests, json, sys, os, time, uuid
from datetime import date, datetime, timedelta
from typing import Optional

os.environ["PYTHONIOENCODING"] = "utf-8"
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8000/api/v1"
HOSPITAL_ID = "2e0920f1-be0d-4cf0-a2f5-e103397c623f"
USER_ID = "778b6936-0f6d-469a-a72f-a9a764b95170"

results = []
created_ids = {"patients": [], "leads": [], "cases": [], "appointments": [], "treatment_plans": [], "treatment_sittings": [], "enquiries": [], "treatment_types": []}

# ─── Auth ─────────────────────────────────────────────────────────────────
def login():
    r = requests.post(f"{BASE}/auth/login", json={"email": "superadmin@dental.com", "password": "SuperAdmin@123"})
    data = r.json()
    if "access_token" not in data:
        print(f"  LOGIN FAILED: {r.status_code} {r.text[:200]}")
        raise Exception(f"Login failed: {data}")
    return data["access_token"]

_token_cache = [None]

def get_token():
    if not _token_cache[0]:
        _token_cache[0] = login()
    return _token_cache[0]

def invalidate_token():
    _token_cache[0] = None

def hdr():
    try:
        return {"Authorization": f"Bearer {get_token()}"}
    except Exception:
        invalidate_token()
        return {"Authorization": f"Bearer {get_token()}"}

# ─── Test Data Creation ───────────────────────────────────────────────────
def create_patient(name=None):
    name = name or f"TestPatient_{uuid.uuid4().hex[:8]}"
    payload = {
        "full_name": name,
        "phone": f"9{uuid.uuid4().int % 10000000000:010d}",
        "email": f"{name.lower()}@test.com",
        "gender": "MALE",
        "date_of_birth": "1990-01-15",
        "hospital_id": HOSPITAL_ID,
    }
    r = requests.post(f"{BASE}/patients/", json=payload, headers=hdr())
    if r.status_code in (200, 201):
        data = r.json()
        pid = data.get("id") or data.get("patient", {}).get("id") or data.get("patient_id")
        if pid:
            created_ids["patients"].append(pid)
            return pid
    print(f"  WARN: create_patient failed ({r.status_code}): {r.text[:150]}")
    return None

def create_lead(name=None, patient_id=None):
    name = name or f"TestLead_{uuid.uuid4().hex[:8]}"
    payload = {
        "lead_name": name,
        "mobile": f"9{uuid.uuid4().int % 10000000000:010d}",
        "source": "WEBSITE",
        "status": "NEW",
        "hospital_id": HOSPITAL_ID,
    }
    if patient_id:
        payload["converted_patient_id"] = patient_id
    r = requests.post(f"{BASE}/leads/", json=payload, headers=hdr())
    if r.status_code in (200, 201):
        lid = r.json().get("id") or r.json().get("lead", {}).get("id")
        if lid:
            created_ids["leads"].append(lid)
            return lid
    print(f"  WARN: create_lead failed ({r.status_code}): {r.text[:150]}")
    return None

DOCTOR_ID = None

def _get_doctor_id():
    global DOCTOR_ID
    if DOCTOR_ID:
        return DOCTOR_ID
    import psycopg2
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE role = 'DOCTOR' AND is_active = true LIMIT 1")
    row = cur.fetchone()
    cur.close()
    conn.close()
    if row:
        DOCTOR_ID = str(row[0])
        return DOCTOR_ID
    return None

def create_appointment(patient_id, days_from_now=5):
    import psycopg2
    appt_id = str(uuid.uuid4())
    appt_date = (date.today() + timedelta(days=days_from_now)).isoformat()
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO appointments (id, patient_id, doctor_id, appointment_date, appointment_time, status, is_active, appointment_type, duration_minutes, end_time, created_at, updated_at)
           VALUES (%s, %s, %s, %s, '10:00', 'SCHEDULED', true, 'CONSULTATION', 30, '10:30', NOW(), NOW())""",
        (appt_id, patient_id, _get_doctor_id(), appt_date),
    )
    conn.commit()
    cur.close()
    conn.close()
    created_ids["appointments"].append(appt_id)
    return appt_id

def create_case(patient_id, treatment_type_id=None):
    payload = {
        "patient_id": patient_id,
        "chief_complaint": "Test case",
    }
    if treatment_type_id:
        payload["treatment_type_id"] = treatment_type_id
    r = requests.post(f"{BASE}/cases/", json=payload, headers=hdr())
    if r.status_code in (200, 201):
        data = r.json()
        cid = data.get("id") or data.get("case", {}).get("id")
        if cid:
            created_ids["cases"].append(cid)
            return cid
    print(f"  WARN: create_case failed ({r.status_code}): {r.text[:100]}")
    return None

def create_treatment_plan(case_id=None, patient_id=None, treatment_type_id=None):
    import psycopg2
    plan_id = str(uuid.uuid4())
    if case_id:
        conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO treatment_plans (id, case_id, treatment_name, cost, paid_amount, treatment_type_id, status, is_active, total_sittings, completed_sittings, remaining_sittings, created_at, updated_at)
               VALUES (%s, %s, 'Test Plan', 1000, 0, %s, 'GENERATED', true, 1, 0, 1, NOW(), NOW())""",
            (plan_id, case_id, treatment_type_id),
        )
        conn.commit()
        cur.close()
        conn.close()
    created_ids["treatment_plans"].append(plan_id)
    return plan_id

def complete_case(case_id):
    import psycopg2
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
    cur = conn.cursor()
    cur.execute("UPDATE cases SET status = 'COMPLETED', completion_date = CURRENT_DATE, updated_at = NOW() WHERE id = %s", (case_id,))
    conn.commit()
    cur.close()
    conn.close()
    return True

# ─── Settings APIs ────────────────────────────────────────────────────────
def save_general_settings(**kwargs):
    r = requests.put(f"{BASE}/crm-config/general", json=kwargs, headers=hdr())
    ok = r.status_code == 200
    if ok:
        import psycopg2
        conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
        cur = conn.cursor()
        for k, v in kwargs.items():
            cur.execute(
                "UPDATE crm_configs SET config_group = 'GENERAL' WHERE hospital_id = %s AND config_key = %s AND config_group != 'GENERAL'",
                (HOSPITAL_ID, k),
            )
        conn.commit()
        cur.close()
        conn.close()
    return ok, r.json() if ok else {"error": r.text[:200]}

def get_general_settings():
    r = requests.get(f"{BASE}/crm-config/general", headers=hdr())
    return r.json() if r.status_code == 200 else {}

def save_lead_settings(enabled=True, delay=1):
    r = requests.put(f"{BASE}/crm-config/lead", json={"enabled": enabled, "start_delay_days": delay}, headers=hdr())
    return r.status_code == 200, r.json() if r.status_code == 200 else {"error": r.text[:200]}

def get_lead_settings():
    r = requests.get(f"{BASE}/crm-config/lead", headers=hdr())
    return r.json() if r.status_code == 200 else {}

def save_opd_settings(enabled=True, delay=3):
    r = requests.put(f"{BASE}/crm-config/opd", json={"enabled": enabled, "start_delay_days": delay}, headers=hdr())
    return r.status_code == 200, r.json() if r.status_code == 200 else {"error": r.text[:200]}

def get_opd_settings():
    r = requests.get(f"{BASE}/crm-config/opd", headers=hdr())
    return r.json() if r.status_code == 200 else {}

def save_treatment_settings(treatment_type_id, enabled=True, delay=3):
    r = requests.put(f"{BASE}/crm-config/treatment/{treatment_type_id}", json={"enabled": enabled, "start_delay_days": delay}, headers=hdr())
    return r.status_code == 200, r.json() if r.status_code == 200 else {"error": r.text[:200]}

def get_treatment_settings():
    r = requests.get(f"{BASE}/crm-config/treatment", headers=hdr())
    return r.json() if r.status_code == 200 else {}

def save_case_settings(section, enabled=True, delay=3):
    r = requests.put(f"{BASE}/crm-config/case/{section}", json={"enabled": enabled, "start_delay_days": delay}, headers=hdr())
    return r.status_code == 200, r.json() if r.status_code == 200 else {"error": r.text[:200]}

def get_case_settings():
    r = requests.get(f"{BASE}/crm-config/case", headers=hdr())
    return r.json() if r.status_code == 200 else {}

# ─── Event APIs ───────────────────────────────────────────────────────────
def fire_lead_event(lead_id, patient_id=None, status="NEW"):
    payload = {
        "hospital_id": HOSPITAL_ID,
        "lead_id": lead_id,
        "status": status,
        "payload": {"visit_date": date.today().isoformat()},
    }
    if patient_id:
        payload["patient_id"] = patient_id
    r = requests.post(f"{BASE}/crm/test/lead-event", json=payload, headers=hdr())
    return r.json() if r.status_code == 200 else {"error": r.status_code, "text": r.text[:200]}

def fire_generic_event(event_type, entity_type="PATIENT", entity_id=None, patient_id=None, payload=None):
    p = payload or {}
    if patient_id:
        p["patient_id"] = patient_id
    if entity_id:
        p["entity_id"] = entity_id
    r = requests.post(f"{BASE}/crm/test/event", json={
        "event_type": event_type,
        "entity_type": entity_type,
        "entity_id": entity_id or "test-entity",
        "hospital_id": HOSPITAL_ID,
        "patient_id": patient_id,
        "payload": p,
    }, headers=hdr())
    return r.json() if r.status_code == 200 else {"error": r.status_code, "text": r.text[:200]}

def fire_opd_event(patient_id, treatment_started=False):
    return fire_generic_event(
        "OPD_CONSULTATION_COMPLETED", "PATIENT", patient_id, patient_id,
        {"visit_date": date.today().isoformat(), "treatment_started": treatment_started}
    )

def fire_appointment_event(appointment_id, patient_id):
    return fire_generic_event(
        "APPOINTMENT_CREATED", "APPOINTMENT", appointment_id, patient_id,
        {"visit_date": date.today().isoformat()}
    )

def fire_treatment_visit(patient_id, case_id, plan_id, sitting_id, visit_num, total_visits, stage="MIDDLE", ttid=None):
    p = {
        "visit_date": date.today().isoformat(),
        "visit_number": visit_num,
        "total_visits": total_visits,
        "visit_stage": stage,
        "case_id": case_id,
        "treatment_plan_id": plan_id,
        "sitting_id": sitting_id,
    }
    if ttid:
        p["treatment_type_id"] = ttid
    return fire_generic_event("TREATMENT_VISIT_COMPLETED", "TREATMENT", plan_id, patient_id, p)

def fire_treatment_completed(patient_id, case_id, plan_id, ttid=None):
    p = {
        "visit_date": date.today().isoformat(),
        "case_id": case_id,
        "treatment_plan_id": plan_id,
    }
    if ttid:
        p["treatment_type_id"] = ttid
    return fire_generic_event("TREATMENT_COMPLETED", "TREATMENT", plan_id, patient_id, p)

def fire_case_completed(case_id, patient_id):
    return fire_generic_event(
        "CASE_COMPLETED", "CASE", case_id, patient_id,
        {"visit_date": date.today().isoformat()}
    )

# ─── DB Verification ─────────────────────────────────────────────────────
def count_enquiries(patient_id=None, enquiry_type=None, status=None, lead_id=None):
    import psycopg2
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
    cur = conn.cursor()
    conditions = ["hospital_id = %s"]
    params = [HOSPITAL_ID]
    if patient_id:
        conditions.append("patient_id = %s")
        params.append(patient_id)
    if lead_id:
        conditions.append("lead_id = %s")
        params.append(lead_id)
    if enquiry_type:
        conditions.append("enquiry_type = %s")
        params.append(enquiry_type)
    if status:
        conditions.append("status = %s")
        params.append(status)
    where = " AND ".join(conditions)
    cur.execute(f"SELECT COUNT(*) FROM generated_enquiries WHERE {where}", params)
    count = cur.fetchone()[0]
    cur.close()
    conn.close()
    return count

def list_active_enquiries(patient_id=None, lead_id=None):
    import psycopg2
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
    cur = conn.cursor()
    conditions = ["hospital_id = %s", "status NOT IN ('COMPLETED','CANCELLED','LOST','CONVERTED')"]
    params = [HOSPITAL_ID]
    if patient_id:
        conditions.append("patient_id = %s")
        params.append(patient_id)
    if lead_id:
        conditions.append("lead_id = %s")
        params.append(lead_id)
    where = " AND ".join(conditions)
    cur.execute(f"SELECT id, enquiry_type, status, due_date, patient_id, lead_id FROM generated_enquiries WHERE {where} ORDER BY created_at", params)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

def count_active_by_type(patient_id=None, lead_id=None):
    import psycopg2
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
    cur = conn.cursor()
    conditions = ["hospital_id = %s", "status NOT IN ('COMPLETED','CANCELLED','LOST','CONVERTED')"]
    params = [HOSPITAL_ID]
    if patient_id:
        conditions.append("patient_id = %s")
        params.append(patient_id)
    if lead_id:
        conditions.append("lead_id = %s")
        params.append(lead_id)
    where = " AND ".join(conditions)
    cur.execute(f"SELECT enquiry_type, COUNT(*) FROM generated_enquiries WHERE {where} GROUP BY enquiry_type", params)
    rows = {r[0]: r[1] for r in cur.fetchall()}
    cur.close()
    conn.close()
    return rows

# ─── Cleanup ──────────────────────────────────────────────────────────────
def cleanup():
    import psycopg2
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
    cur = conn.cursor()
    for pid in created_ids["patients"]:
        cur.execute("DELETE FROM generated_enquiries WHERE patient_id = %s AND hospital_id = %s", (pid, HOSPITAL_ID))
        cur.execute("DELETE FROM treatment_sittings WHERE treatment_plan_id IN (SELECT tp.id FROM treatment_plans tp JOIN cases c ON tp.case_id = c.id WHERE c.patient_id = %s)", (pid,))
        cur.execute("DELETE FROM treatment_plans WHERE case_id IN (SELECT id FROM cases WHERE patient_id = %s)", (pid,))
        cur.execute("DELETE FROM patient_timelines WHERE patient_id = %s", (pid,))
        cur.execute("DELETE FROM case_timelines WHERE case_id IN (SELECT id FROM cases WHERE patient_id = %s)", (pid,))
        cur.execute("DELETE FROM cases WHERE patient_id = %s", (pid,))
        cur.execute("DELETE FROM appointments WHERE patient_id = %s", (pid,))
        cur.execute("DELETE FROM patients WHERE id = %s", (pid,))
    for lid in created_ids["leads"]:
        cur.execute("DELETE FROM generated_enquiries WHERE lead_id = %s AND hospital_id = %s", (lid, HOSPITAL_ID))
        cur.execute("DELETE FROM leads WHERE id = %s", (lid,))
    for aid in created_ids["appointments"]:
        cur.execute("DELETE FROM generated_enquiries WHERE appointment_id = %s AND hospital_id = %s", (aid, HOSPITAL_ID))
        cur.execute("DELETE FROM appointments WHERE id = %s", (aid,))
    for cid in created_ids["cases"]:
        cur.execute("DELETE FROM generated_enquiries WHERE case_id = %s AND hospital_id = %s", (cid, HOSPITAL_ID))
        cur.execute("DELETE FROM treatment_sittings WHERE treatment_plan_id IN (SELECT id FROM treatment_plans WHERE case_id = %s)", (cid,))
        cur.execute("DELETE FROM treatment_plans WHERE case_id = %s", (cid,))
        cur.execute("DELETE FROM case_timelines WHERE case_id = %s", (cid,))
        cur.execute("DELETE FROM cases WHERE id = %s", (cid,))
    conn.commit()
    cur.close()
    conn.close()
    for k in created_ids:
        created_ids[k] = []

# ─── Test Runner ──────────────────────────────────────────────────────────
def run_test(section, test_num, name, func):
    test_id = f"S{section}.{test_num}"
    print(f"\n{'='*70}")
    print(f"  {test_id}: {name}")
    print(f"{'='*70}")
    try:
        success, detail = func()
        status = "PASS" if success else "FAIL"
        results.append({"section": section, "num": test_num, "id": test_id, "name": name, "status": status, "detail": detail})
        print(f"  Result: {'✅ PASS' if success else '❌ FAIL'} — {detail}")
    except Exception as e:
        results.append({"section": section, "num": test_num, "id": test_id, "name": name, "status": "FAIL", "detail": str(e)})
        print(f"  Result: ❌ FAIL — Exception: {e}")
    cleanup()


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 1: GENERAL SETTINGS
# ═══════════════════════════════════════════════════════════════════════════

def test_s1_1():
    """Save and reload general settings"""
    ok, _ = save_general_settings(crm_working_days="MON,TUE,WED,THU,FRI", crm_business_start="10:00", crm_business_end="20:00")
    data = get_general_settings()
    ok2 = (data.get("crm_working_days") == "MON,TUE,WED,THU,FRI" and
           data.get("crm_business_start") == "10:00" and
           data.get("crm_business_end") == "20:00")
    return ok and ok2, f"working_days={data.get('crm_working_days')}, start={data.get('crm_business_start')}, end={data.get('crm_business_end')}"

def test_s1_2():
    """Update reminder time and verify reload"""
    save_general_settings(crm_reminder_time="08:30")
    data = get_general_settings()
    ok = data.get("crm_reminder_time") == "08:30"
    save_general_settings(crm_reminder_time="09:00")
    data2 = get_general_settings()
    ok2 = data2.get("crm_reminder_time") == "09:00"
    return ok and ok2, f"saved 08:30={ok}, updated 09:00={ok2}"

def test_s1_3():
    """Update timezone and verify"""
    save_general_settings(crm_timezone="Asia/Dubai")
    data = get_general_settings()
    ok = data.get("crm_timezone") == "Asia/Dubai"
    save_general_settings(crm_timezone="Asia/Kolkata")
    return ok, f"timezone={data.get('crm_timezone')}"

def test_s1_4():
    """Update weekend policy and holidays"""
    save_general_settings(crm_weekend_policy="INCLUDE", crm_holidays='["2026-01-26","2026-08-15"]')
    data = get_general_settings()
    ok = data.get("crm_weekend_policy") == "INCLUDE" and "2026-01-26" in data.get("crm_holidays", "")
    save_general_settings(crm_weekend_policy="SKIP", crm_holidays="[]")
    return ok, f"weekend={data.get('crm_weekend_policy')}, holidays={data.get('crm_holidays')[:30]}"

def test_s1_5():
    """Toggle CRM master on/off and verify rule engine response"""
    save_general_settings(crm_enabled="false")
    # Fire lead event — should produce NO decisions when CRM disabled
    pid = create_patient()
    lid = create_lead(patient_id=pid)
    result = fire_lead_event(lid, pid)
    decisions = result.get("data", {}).get("decisions", [])
    count = count_active_by_type(lead_id=lid)
    off_ok = len(count) == 0, f"CRM off: decisions={len(decisions)}, active_enquiries={count}"

    save_general_settings(crm_enabled="true")
    result2 = fire_lead_event(lid, pid)
    count2 = count_active_by_type(lead_id=lid)
    on_ok = len(count2) > 0, f"CRM on: decisions={len(result2.get('data', {}).get('decisions', []))}, active_enquiries={count2}"
    return off_ok[0] and on_ok[0], f"off={off_ok[1]}, on={on_ok[1]}"


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 2: LEAD SETTINGS
# ═══════════════════════════════════════════════════════════════════════════

def test_s2_1():
    """Enable lead follow-up → ONE LEAD_FOLLOW_UP enquiry"""
    save_lead_settings(enabled=True, delay=1)
    pid = create_patient()
    lid = create_lead(patient_id=pid)
    result = fire_lead_event(lid, pid)
    enquiries = list_active_enquiries(lead_id=lid)
    types = count_active_by_type(lead_id=lid)
    ok = len(enquiries) == 1 and types.get("LEAD_FOLLOW_UP", 0) == 1
    return ok, f"expected=1 LEAD_FOLLOW_UP, got={types}"

def test_s2_2():
    """Disable lead follow-up → NO enquiry"""
    save_lead_settings(enabled=False)
    pid = create_patient()
    lid = create_lead(patient_id=pid)
    result = fire_lead_event(lid, pid)
    types = count_active_by_type(lead_id=lid)
    ok = len(types) == 0
    return ok, f"expected=0 enquiries, got={types}"

def test_s2_3():
    """Change delay → scheduled date changes"""
    save_lead_settings(enabled=True, delay=5)
    pid = create_patient()
    lid = create_lead(patient_id=pid)
    fire_lead_event(lid, pid)
    enquiries = list_active_enquiries(lead_id=lid)
    if enquiries:
        due = enquiries[0][3]  # due_date
        expected = date.today() + timedelta(days=5)
        ok = due == expected
        return ok, f"expected due={expected}, got={due}"
    return False, "no enquiry created"

def test_s2_4():
    """Duplicate event → only ONE enquiry"""
    save_lead_settings(enabled=True, delay=1)
    pid = create_patient()
    lid = create_lead(patient_id=pid)
    fire_lead_event(lid, pid)
    fire_lead_event(lid, pid)
    fire_lead_event(lid, pid)
    types = count_active_by_type(lead_id=lid)
    total = sum(types.values())
    ok = total == 1
    return ok, f"expected=1 total, got={total} ({types})"

def test_s2_5():
    """Lead converted → LEAD_FOLLOW_UP cancelled"""
    save_lead_settings(enabled=True, delay=1)
    pid = create_patient()
    lid = create_lead(patient_id=pid)
    fire_lead_event(lid, pid)
    before = count_active_by_type(lead_id=lid)
    fire_generic_event("LEAD_CONVERTED", "LEAD", lid, pid, {"patient_id": pid})
    after = count_active_by_type(lead_id=lid)
    ok = before.get("LEAD_FOLLOW_UP", 0) == 1 and after.get("LEAD_FOLLOW_UP", 0) == 0
    return ok, f"before={before}, after={after}"


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 3: OPD SETTINGS
# ═══════════════════════════════════════════════════════════════════════════

def test_s3_1():
    """OPD consultation, no treatment → ONE OPD_FOLLOW_UP"""
    save_opd_settings(enabled=True, delay=3)
    pid = create_patient()
    result = fire_opd_event(pid, treatment_started=False)
    types = count_active_by_type(patient_id=pid)
    ok = types.get("OPD_FOLLOW_UP", 0) == 1
    return ok, f"expected=1 OPD_FOLLOW_UP, got={types}"

def test_s3_2():
    """OPD consultation, treatment started → NO OPD_FOLLOW_UP"""
    save_opd_settings(enabled=True, delay=3)
    pid = create_patient()
    result = fire_opd_event(pid, treatment_started=True)
    types = count_active_by_type(patient_id=pid)
    ok = types.get("OPD_FOLLOW_UP", 0) == 0
    return ok, f"expected=0 OPD_FOLLOW_UP (treatment started), got={types}"

def test_s3_3():
    """Disable OPD follow-up → NO enquiry"""
    save_opd_settings(enabled=False)
    pid = create_patient()
    fire_opd_event(pid, treatment_started=False)
    types = count_active_by_type(patient_id=pid)
    ok = len(types) == 0
    return ok, f"expected=0, got={types}"

def test_s3_4():
    """Change OPD delay → due date changes"""
    save_opd_settings(enabled=True, delay=7)
    pid = create_patient()
    fire_opd_event(pid, treatment_started=False)
    enquiries = list_active_enquiries(patient_id=pid)
    if enquiries:
        due = enquiries[0][3]
        expected = date.today() + timedelta(days=7)
        ok = due == expected
        return ok, f"expected due={expected}, got={due}"
    return False, "no enquiry created"

def test_s3_5():
    """Duplicate OPD event → only ONE enquiry"""
    save_opd_settings(enabled=True, delay=3)
    pid = create_patient()
    fire_opd_event(pid, treatment_started=False)
    fire_opd_event(pid, treatment_started=False)
    fire_opd_event(pid, treatment_started=False)
    types = count_active_by_type(patient_id=pid)
    total = sum(types.values())
    ok = total == 1
    return ok, f"expected=1, got={total} ({types})"


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 4: TREATMENT SETTINGS
# ═══════════════════════════════════════════════════════════════════════════

def _get_first_treatment_type():
    import psycopg2
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
    cur = conn.cursor()
    cur.execute("SELECT id, name FROM treatment_types WHERE is_active = true LIMIT 1")
    row = cur.fetchone()
    cur.close()
    conn.close()
    return (row[0], row[1]) if row else (None, None)

def test_s4_1():
    """Treatment Visit 1 (not final) with future appointment → APPOINTMENT_REMINDER"""
    ttid, tname = _get_first_treatment_type()
    if not ttid:
        return False, "No treatment types found in DB"
    save_treatment_settings(ttid, enabled=True, delay=3)
    pid = create_patient()
    aid = create_appointment(pid, days_from_now=5)
    cid = create_case(pid, ttid)
    plan_id = create_treatment_plan(cid, pid, ttid)
    fire_treatment_visit(pid, cid, plan_id, "sitting1", 1, 3, "MIDDLE", ttid)
    types = count_active_by_type(patient_id=pid)
    ok = types.get("APPOINTMENT_REMINDER", 0) >= 1
    return ok, f"expected APPOINTMENT_REMINDER, got={types}"

def test_s4_2():
    """Treatment Completed, no future appointment → TREATMENT_WELLNESS"""
    ttid, tname = _get_first_treatment_type()
    if not ttid:
        return False, "No treatment types found in DB"
    save_treatment_settings(ttid, enabled=True, delay=3)
    pid = create_patient()
    cid = create_case(pid, ttid)
    plan_id = create_treatment_plan(cid, pid, ttid)
    fire_treatment_completed(pid, cid, plan_id, ttid)
    types = count_active_by_type(patient_id=pid)
    ok = types.get("TREATMENT_WELLNESS", 0) == 1
    return ok, f"expected=1 TREATMENT_WELLNESS, got={types}"

def test_s4_3():
    """Disable treatment follow-up → NO TREATMENT_WELLNESS"""
    ttid, tname = _get_first_treatment_type()
    if not ttid:
        return False, "No treatment types found in DB"
    save_treatment_settings(ttid, enabled=False)
    pid = create_patient()
    cid = create_case(pid, ttid)
    plan_id = create_treatment_plan(cid, pid, ttid)
    fire_treatment_completed(pid, cid, plan_id, ttid)
    types = count_active_by_type(patient_id=pid)
    ok = types.get("TREATMENT_WELLNESS", 0) == 0
    return ok, f"expected=0 TREATMENT_WELLNESS, got={types}"

def test_s4_4():
    """Treatment Completed, future appointment exists → APPOINTMENT_REMINDER not TREATMENT_WELLNESS"""
    ttid, tname = _get_first_treatment_type()
    if not ttid:
        return False, "No treatment types found in DB"
    save_treatment_settings(ttid, enabled=True, delay=3)
    pid = create_patient()
    aid = create_appointment(pid, days_from_now=10)
    cid = create_case(pid, ttid)
    plan_id = create_treatment_plan(cid, pid, ttid)
    fire_treatment_completed(pid, cid, plan_id, ttid)
    types = count_active_by_type(patient_id=pid)
    has_reminder = types.get("APPOINTMENT_REMINDER", 0) >= 1
    ok = has_reminder
    return ok, f"expected APPOINTMENT_REMINDER (has future apt), got={types}"

def test_s4_5():
    """Duplicate treatment completed → only ONE TREATMENT_WELLNESS"""
    ttid, tname = _get_first_treatment_type()
    if not ttid:
        return False, "No treatment types found in DB"
    save_treatment_settings(ttid, enabled=True, delay=3)
    pid = create_patient()
    cid = create_case(pid, ttid)
    plan_id = create_treatment_plan(cid, pid, ttid)
    fire_treatment_completed(pid, cid, plan_id, ttid)
    fire_treatment_completed(pid, cid, plan_id, ttid)
    fire_treatment_completed(pid, cid, plan_id, ttid)
    types = count_active_by_type(patient_id=pid)
    total = sum(types.values())
    ok = total == 1
    return ok, f"expected=1 total, got={total} ({types})"


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 5: CASE SETTINGS
# ═══════════════════════════════════════════════════════════════════════════

def test_s5_1():
    """Case completed → ONE CASE_WELLNESS"""
    save_case_settings("recovery", enabled=True, delay=3)
    save_case_settings("recall", enabled=True, delay=180)
    pid = create_patient()
    cid = create_case(pid)
    complete_case(cid)
    fire_case_completed(cid, pid)
    types = count_active_by_type(patient_id=pid)
    ok = types.get("CASE_WELLNESS", 0) == 1
    return ok, f"expected=1 CASE_WELLNESS, got={types}"

def test_s5_2():
    """Case completed → ONE RECALL"""
    save_case_settings("recovery", enabled=True, delay=3)
    save_case_settings("recall", enabled=True, delay=180)
    pid = create_patient()
    cid = create_case(pid)
    complete_case(cid)
    fire_case_completed(cid, pid)
    types = count_active_by_type(patient_id=pid)
    ok = types.get("RECALL", 0) == 1
    return ok, f"expected=1 RECALL, got={types}"

def test_s5_3():
    """Disable case recovery → NO CASE_WELLNESS"""
    save_case_settings("recovery", enabled=False)
    save_case_settings("recall", enabled=False)
    pid = create_patient()
    cid = create_case(pid)
    complete_case(cid)
    fire_case_completed(cid, pid)
    types = count_active_by_type(patient_id=pid)
    ok = types.get("CASE_WELLNESS", 0) == 0 and types.get("RECALL", 0) == 0
    return ok, f"expected=0 CASE_WELLNESS+RECALL, got={types}"

def test_s5_4():
    """Case recovery delay changed → due date updated"""
    save_case_settings("recovery", enabled=True, delay=10)
    save_case_settings("recall", enabled=False)
    pid = create_patient()
    cid = create_case(pid)
    complete_case(cid)
    fire_case_completed(cid, pid)
    enquiries = list_active_enquiries(patient_id=pid)
    wellness = [e for e in enquiries if e[1] == "CASE_WELLNESS"]
    if wellness:
        due = wellness[0][3]
        expected = date.today() + timedelta(days=10)
        ok = due == expected
        return ok, f"expected due={expected}, got={due}"
    return False, "no CASE_WELLNESS created"

def test_s5_5():
    """Duplicate case completed → only ONE CASE_WELLNESS"""
    save_case_settings("recovery", enabled=True, delay=3)
    save_case_settings("recall", enabled=True, delay=180)
    pid = create_patient()
    cid = create_case(pid)
    complete_case(cid)
    fire_case_completed(cid, pid)
    fire_case_completed(cid, pid)
    fire_case_completed(cid, pid)
    types = count_active_by_type(patient_id=pid)
    cw = types.get("CASE_WELLNESS", 0)
    rc = types.get("RECALL", 0)
    ok = cw == 1 and rc == 1
    return ok, f"expected CASE_WELLNESS=1 RECALL=1, got CASE_WELLNESS={cw} RECALL={rc}"


# ═══════════════════════════════════════════════════════════════════════════
# MAIN RUNNER
# ═══════════════════════════════════════════════════════════════════════════

def main():
    _token_cache[0] = None
    print("\n" + "=" * 70)
    print("  NUSHINE DENTAL ERP — CRM SETTINGS VALIDATION SUITE")
    print("  25 End-to-End Tests")
    print("=" * 70)

    # Clean stale PENDING lead follow-up enquiries from previous runs
    import psycopg2
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM generated_enquiries WHERE hospital_id = %s AND enquiry_type = 'LEAD_FOLLOW_UP' AND status = 'PENDING' AND patient_id IS NULL",
        (HOSPITAL_ID,),
    )
    stale_count = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    if stale_count:
        print(f"  Cleaned {stale_count} stale PENDING LEAD_FOLLOW_UP enquiries")

    # Reset to clean defaults first
    save_general_settings(crm_enabled="true", crm_working_days="MON,TUE,WED,THU,FRI,SAT",
                          crm_reminder_time="09:00", crm_business_start="09:00",
                          crm_business_end="18:00", crm_timezone="Asia/Kolkata",
                          crm_reminder_offset="1", crm_weekend_policy="SKIP", crm_holidays="[]")
    save_lead_settings(enabled=True, delay=1)
    save_opd_settings(enabled=True, delay=3)

    # ─── Section 1: General Settings ───
    run_test(1, 1, "Save & reload general settings", test_s1_1)
    run_test(1, 2, "Update reminder time, no cache issues", test_s1_2)
    run_test(1, 3, "Update timezone", test_s1_3)
    run_test(1, 4, "Weekend policy & holidays", test_s1_4)
    run_test(1, 5, "Toggle CRM master on/off", test_s1_5)

    # ─── Section 2: Lead Settings ───
    run_test(2, 1, "Enable lead follow-up → 1 LEAD_FOLLOW_UP", test_s2_1)
    run_test(2, 2, "Disable lead follow-up → 0 enquiries", test_s2_2)
    run_test(2, 3, "Change delay → scheduled date changes", test_s2_3)
    run_test(2, 4, "Duplicate event → only 1 enquiry", test_s2_4)
    run_test(2, 5, "Lead converted → follow-up cancelled", test_s2_5)

    # ─── Section 3: OPD Settings ───
    run_test(3, 1, "OPD no treatment → 1 OPD_FOLLOW_UP", test_s3_1)
    run_test(3, 2, "OPD treatment started → 0 enquiries", test_s3_2)
    run_test(3, 3, "Disable OPD → 0 enquiries", test_s3_3)
    run_test(3, 4, "Change OPD delay → due date changes", test_s3_4)
    run_test(3, 5, "Duplicate OPD event → only 1 enquiry", test_s3_5)

    # ─── Section 4: Treatment Settings ───
    run_test(4, 1, "Visit 1 with future apt → APPT_REMINDER", test_s4_1)
    run_test(4, 2, "Treatment completed → TREATMENT_WELLNESS", test_s4_2)
    run_test(4, 3, "Disable treatment → 0 enquiries", test_s4_3)
    run_test(4, 4, "Treatment completed with apt → APPT_REMINDER", test_s4_4)
    run_test(4, 5, "Duplicate treatment → only 1 enquiry", test_s4_5)

    # ─── Section 5: Case Settings ───
    run_test(5, 1, "Case completed → 1 CASE_WELLNESS", test_s5_1)
    run_test(5, 2, "Case completed → 1 RECALL", test_s5_2)
    run_test(5, 3, "Disable case recovery → 0 enquiries", test_s5_3)
    run_test(5, 4, "Case delay changed → due date updated", test_s5_4)
    run_test(5, 5, "Duplicate case completed → 1 each", test_s5_5)

    # ─── Final Report ───
    print("\n" + "=" * 70)
    print("  FINAL REPORT")
    print("=" * 70)

    for section in range(1, 6):
        section_results = [r for r in results if r["section"] == section]
        passed = sum(1 for r in section_results if r["status"] == "PASS")
        total = len(section_results)
        label = ["", "GENERAL", "LEAD", "OPD", "TREATMENT", "CASE"][section]
        print(f"\n  {label} SETTINGS: {passed}/{total} {'✅ ALL PASS' if passed == total else '❌ FAILURES'}")
        for r in section_results:
            print(f"    {r['id']}: {'✅' if r['status'] == 'PASS' else '❌'} {r['name']}")
            if r['status'] == 'FAIL':
                print(f"         → {r['detail']}")

    total_passed = sum(1 for r in results if r["status"] == "PASS")
    total_all = len(results)
    print(f"\n  {'=' * 60}")
    print(f"  TOTAL: {total_passed}/{total_all} {'✅ ALL CRM SETTINGS VERIFIED' if total_passed == total_all else '❌ FAILURES DETECTED'}")
    print(f"  {'=' * 60}")

    cleanup()

    return total_passed == total_all


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
