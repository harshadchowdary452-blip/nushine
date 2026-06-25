"""End-to-end CRM workflow test using real database via HTTP"""
import httpx
import json
import random
import sys
from datetime import date, timedelta, datetime

BASE = "http://localhost:8000/api/v1"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def main():
    client = httpx.Client(base_url=BASE, timeout=30, follow_redirects=True)

    # ── STEP 0: Login ──
    log("=== STEP 0: Login ===")
    r = client.post("/auth/login", json={"email": "superadmin@dental.com", "password": "SuperAdmin@123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.headers.update(headers)
    log(f"Logged in as SUPER_ADMIN")

    # ── STEP 1: Check CRM Settings ──
    log("\n=== STEP 1: CRM Settings ===")
    r = client.get("/crm/settings/rules")
    log(f"CRM Settings rules: {r.status_code}")
    if r.status_code == 200:
        rules = r.json()
        log(f"  Rules count: {len(rules)}")
        for rule in rules:
            log(f"  Rule: {rule['treatment_name']} | template_id={rule.get('treatment_template_id')} | 1d={rule['follow_up_1_day']} 7d={rule['follow_up_7_day']} 6m={rule['recall_6_month']} 12m={rule['recall_12_month']}")
    else:
        log(f"  Failed to get rules: {r.text}")

    # Check templates
    r = client.get("/crm/settings/templates")
    templates = r.json() if r.status_code == 200 else []
    log(f"Treatment Templates: {len(templates)}")

    # ── STEP 2: Get/create test data ──
    log("\n=== STEP 2: Test Data Setup ===")

    # Get hospitals
    r = client.get("/hospitals")
    log(f"Hospitals: {r.status_code}")
    hospitals = r.json() if r.status_code == 200 else []
    if isinstance(hospitals, list) and len(hospitals) > 0:
        hospital = hospitals[0]
        log(f"  Using hospital: {hospital.get('name', '?')} (id={hospital.get('id', '?')})")
        h_id = hospital["id"]
    else:
        log("  No hospitals found - creating one...")
        r = client.post("/hospitals", json={
            "name": "Test Hospital", "address": "123 Test St", "phone": "9999999999",
            "email": "test@hospital.com", "city": "TestCity", "state": "TS", "pincode": "123456"
        })
        log(f"  Create hospital: {r.status_code} | {r.text[:200]}")
        h_id = r.json().get("id") if r.status_code in (200, 201) else None

    log(f"  Hospital ID: {h_id}")
    if not h_id:
        log("  ERROR: No hospital ID available")
        return

    # Look up treatment type ID for rule creation
    log("  Fetching treatment types...")
    tt_r = client.get("/treatment-types")
    tt_id = None
    if tt_r.status_code == 200:
        tts = tt_r.json()
        for tt in tts if isinstance(tts, list) else (tts if isinstance(tts, dict) and "treatment_types" in tts else []):
            if isinstance(tt, dict) and tt.get("name") == "Root Canal Treatment (RCT)":
                tt_id = tt.get("id")
                break
        if not tt_id:
            for tt in tts if isinstance(tts, list) else []:
                if isinstance(tt, dict) and "Root Canal" in tt.get("name", ""):
                    tt_id = tt.get("id")
                    break
    log(f"  Treatment type ID: {tt_id}")
    # Ensure rule exists for treatment_name matching the plan
    log("  Ensuring CRM rule for 'Root Canal' exists...")
    rule_data = {
        "treatment_type_id": tt_id,
        "treatment_name": "Root Canal Treatment (RCT)",
        "follow_up_1_day": True,
        "follow_up_7_day": True,
        "recall_6_month": True,
        "recall_12_month": True,
        "custom_recall_days": None,
    }
    r = client.post("/crm/settings/rules", json=rule_data)
    if r.status_code == 409:
        log("  Rule for 'Root Canal' already exists (good)")
    elif r.status_code in (200, 201):
        log("  Rule for 'Root Canal' created")
    else:
        log(f"  Rule creation: {r.status_code} {r.text[:200]}")
    # Update plan data to use the right treatment name
    if tt_id:
        plan_extra = {"treatment_type_id": tt_id, "treatment_name": "Root Canal Treatment (RCT)"}
    else:
        plan_extra = {"treatment_name": "Root Canal Treatment (RCT)"}

    # Create patient
    log("  Creating patient...")
    patient_data = {
        "full_name": "CRM Test Patient",
        "phone": "9876543210",
        "email": "crmtest@example.com",
        "hospital_id": h_id,
        "date_of_birth": "1990-01-15",
        "gender": "MALE",
    }
    r = client.post("/patients", json=patient_data)
    if r.status_code == 200 or r.status_code == 201:
        patient = r.json()
        p_id = patient.get("id") if isinstance(patient, dict) else None
        log(f"  Patient created: {p_id}")
    else:
        log(f"  Patient creation failed: {r.status_code} {r.text[:300]}")
        return

    # Get or create a doctor
    log("  Creating doctor...")
    unique_suffix = random.randint(10000, 99999)
    doctor_data = {
        "full_name": "Dr. Test Doctor",
        "email": f"dr.test.{unique_suffix}@dental.com",
        "phone": f"888888{unique_suffix}",
        "password": "Doctor@123",
        "hospital_id": h_id,
        "role": "DOCTOR",
        "specialization": "Endodontics",
    }
    r = client.post("/doctors", json=doctor_data)
    if r.status_code == 200 or r.status_code == 201:
        doctor = r.json()
        doc_id = doctor.get("id") if isinstance(doctor, dict) else None
        doc_email = doctor.get("email", doctor_data["email"])
        log(f"  Doctor created: {doc_id} (email={doc_email})")
    else:
        log(f"  Doctor creation result: {r.status_code} {r.text[:300]}")
        return

    # Create case
    log("  Creating case...")
    case_data = {
        "patient_id": p_id,
        "doctor_id": doc_id,
        "hospital_id": h_id,
        "diagnosis": "Root Canal Required - Tooth #16",
        "chief_complaint": "Pain in tooth #16",
        "status": "OPEN",
    }
    r = client.post("/cases", json=case_data)
    if r.status_code == 200 or r.status_code == 201:
        case = r.json()
        c_id = case.get("id") if isinstance(case, dict) else None
        log(f"  Case created: {c_id}")
    else:
        log(f"  Case creation failed: {r.status_code} {r.text[:300]}")
        return

    # Create treatment plan (name must match an existing CRM rule)
    log("  Creating treatment plan (Root Canal, 5 sittings)...")
    plan_data = {
        "case_id": c_id,
        "treatment_name": "Root Canal Treatment (RCT)",
        "treatment_template_id": None,
        "description": "Root Canal Treatment - 5 sittings",
        "cost": 15000.0,
        "total_sittings": 5,
        "status": "IN_PROGRESS",
    }
    if tt_id:
        plan_data["treatment_type_id"] = tt_id
    r = client.post("/treatment-plans", json=plan_data)
    if r.status_code == 200 or r.status_code == 201:
        plan = r.json()
        plan_id = plan.get("id") if isinstance(plan, dict) else None
        log(f"  Plan created: {plan_id} | sittings={plan.get('total_sittings', '?')} | status={plan.get('status', '?')}")
    else:
        log(f"  Plan creation failed: {r.status_code} {r.text[:300]}")
        return

    # ── STEP 3: Create and complete sitting 1 ──
    log("\n=== STEP 3: Sitting 1 Completion ===")
    sitting_data = {
        "treatment_plan_id": plan_id,
        "sitting_number": 1,
        "sitting_date": str(date.today()),
        "doctor_id": doc_id,
        "work_done": "Access cavity preparation and pulp extirpation",
        "status": "PLANNED",
    }
    r = client.post("/treatment-sittings", json=sitting_data)
    if r.status_code == 200 or r.status_code == 201:
        sitting = r.json()
        sit_id = sitting.get("id") if isinstance(sitting, dict) else None
        log(f"  Sitting 1 created: {sit_id} | status={sitting.get('status', '?')}")
    else:
        log(f"  Sitting creation failed: {r.status_code} {r.text[:300]}")
        return

    # Now complete the sitting
    log("  Completing sitting 1...")
    r = client.put(f"/treatment-sittings/{sit_id}", json={
        "status": "COMPLETED",
        "work_done": "Access cavity preparation and pulp extirpation completed",
        "doctor_notes": "Procedure successful, no complications",
    })
    if r.status_code == 200:
        log(f"  Sitting 1 completed: {r.json().get('status', '?')}")
    else:
        log(f"  Sitting completion failed: {r.status_code} {r.text[:300]}")

    # ── Verify plan update ──
    log("\n  Verifying plan update after sitting 1...")
    r = client.get(f"/treatment-plans/{plan_id}")
    if r.status_code == 200:
        plan = r.json()
        log(f"  Plan: status={plan.get('status')} | total={plan.get('total_sittings')} | completed={plan.get('completed_sittings')} | remaining={plan.get('remaining_sittings')} | progress={plan.get('progress')}")
    else:
        log(f"  Plan fetch failed: {r.status_code} {r.text[:200]}")

    # ── Check follow-ups created ──
    log("\n=== STEP 4: Verify Follow-Ups ===")
    # Check our patient's follow-ups
    r = client.get(f"/crm/treatment-follow-ups?patient_id={p_id}")
    if r.status_code == 200:
        fus = r.json()
        log(f"  Our patient's follow-ups: {len(fus)}")
        for fu in fus:
            log(f"    {fu.get('follow_up_type')} | date={fu.get('follow_up_date','?')} | status={fu.get('status','?')}")
    else:
        log(f"  Failed to get follow-ups: {r.status_code} {r.text[:200]}")

    # Check all follow-ups count
    r = client.get("/crm/treatment-follow-ups")
    log(f"  Total treatment follow-ups: {len(r.json()) if r.status_code == 200 else '?'}")

    # Check our patient's follow-ups by type
    for ftype in ["1_DAY_FOLLOW_UP", "7_DAY_FOLLOW_UP"]:
        if r.status_code == 200:
            fus = r.json()
            log(f"  Our {ftype}: {len(fus)} record(s)")
            for fu in fus:
                log(f"    id={fu.get('id','?')} | due={fu.get('follow_up_date','?')} | status={fu.get('status','?')}")

    # ── Check timeline ──
    log("\n=== Timeline Check ===")
    r = client.get(f"/cases/{c_id}/timeline")
    if r.status_code == 200:
        entries = r.json()
        log(f"  Timeline entries: {len(entries) if isinstance(entries, list) else '?'}")
        if isinstance(entries, list):
            for e in entries:
                log(f"    {e.get('action','?')} | {e.get('new_value','')}")
    else:
        log(f"  Timeline failed: {r.status_code} {r.text[:200]}")

    # ── Complete remaining 4 sittings ──
    log("\n=== STEP 5-6: Complete remaining sittings ===")
    for i in range(2, 6):
        log(f"  Creating and completing sitting {i}...")
        r = client.post("/treatment-sittings", json={
            "treatment_plan_id": plan_id,
            "sitting_number": i,
            "sitting_date": str(date.today()),
            "doctor_id": doc_id,
            "work_done": f"Sitting {i} work",
            "status": "PLANNED",
        })
        if r.status_code in (200, 201):
            s_id = r.json().get("id")
            r2 = client.put(f"/treatment-sittings/{s_id}", json={"status": "COMPLETED", "work_done": f"Sitting {i} completed"})
            log(f"    Sitting {i} completed: {r2.status_code}")
        else:
            log(f"    Sitting {i} creation failed: {r.status_code} {r.text[:150]}")

    # ── Verify plan completed ──
    log("\n  Verifying plan after all sittings...")
    r = client.get(f"/treatment-plans/{plan_id}")
    if r.status_code == 200:
        plan = r.json()
        log(f"  Plan: status={plan.get('status')} | total={plan.get('total_sittings')} | completed={plan.get('completed_sittings')} | remaining={plan.get('remaining_sittings')} | progress={plan.get('progress')}")

    # ── Check Recalls ──
    log("\n=== STEP 7: Verify Recalls ===")
    r = client.get(f"/crm/recalls?patient_id={p_id}")
    if r.status_code == 200:
        recalls = r.json()
        log(f"  Recalls for our patient: {len(recalls)}")
        for rec in recalls:
            log(f"    {rec.get('follow_up_type')} | due={rec.get('follow_up_date','?')} | status={rec.get('status','?')}")
    else:
        log(f"  Failed: {r.status_code} {r.text[:200]}")

    # Check all recalls
    r = client.get("/crm/recalls")
    log(f"  All recalls: {len(r.json()) if r.status_code == 200 else '?'}")

    # Check recall calendar
    today_s = str(date.today())
    future = str(date.today() + timedelta(days=400))
    r = client.get(f"/crm/recalls/calendar?start_date={today_s}&end_date={future}")
    if r.status_code == 200:
        cal = r.json()
        log(f"  Recall calendar entries: {len(cal)}")
        for c in cal[:10]:
            log(f"    type={c.get('recall_type') or c.get('follow_up_type','?')} | patient={c.get('patient_name','?')} | due={c.get('recall_date') or c.get('follow_up_date','?')}")
    else:
        log(f"  Failed: {r.status_code} {r.text[:200]}")

    # ── Check Enquiry Calendar (should NOT contain treatment follow-ups or recalls) ──
    log("\n=== STEP 8: Enquiry Calendar Separation ===")
    r = client.get(f"/crm/enquiries/calendar?start_date={today_s}&end_date={today_s}")
    if r.status_code == 200:
        enqs = r.json()
        log(f"  Enquiry calendar entries: {len(enqs)}")
        for enq in enqs:
            log(f"    {enq.get('status','?')} | patient={enq.get('patient_name','?')}")
        if len(enqs) == 0:
            log("  [PASS] Enquiry calendar correctly shows 0 entries (no enquiries created)")
    else:
        log(f"  Failed: {r.status_code} {r.text[:200]}")

    # ── Check CRM Dashboard ──
    log("\n=== STEP 9: CRM Dashboard ===")
    r = client.get("/crm/dashboard")
    if r.status_code == 200:
        dash = r.json()
        metrics = dash.get("metrics", {})
        log(f"  Today's follow-ups: {metrics.get('todays_follow_ups_count', '?')}")
        log(f"  Total follow-ups: {metrics.get('total_follow_ups', '?')}")
        log(f"  Pending: {metrics.get('pending_follow_ups', '?')}")
        log(f"  Completed: {metrics.get('completed_follow_ups', '?')}")
        log(f"  Overdue: {metrics.get('overdue_follow_ups', '?')}")
        log(f"  1-day due: {metrics.get('one_day_follow_ups_due', '?')}")
        log(f"  6-month recalls due: {metrics.get('six_month_recalls_due', '?')}")
        todays = dash.get("todays_follow_ups", [])
        log(f"  Today's follow-up list: {len(todays)} entries")
        for fu in todays[:5]:
            log(f"    type={fu.get('follow_up_type','?')} | patient={fu.get('patient_name','?')} | due={fu.get('follow_up_date','?')}")
    else:
        log(f"  Failed: {r.status_code} {r.text[:200]}")

    # ── Check Doctor Dashboard ──
    log("\n=== STEP 10: Doctor Dashboard ===")
    # Login as doctor
    r_doc = client.post("/auth/login", json={"email": doc_email, "password": "Doctor@123"})
    if r_doc.status_code == 200:
        doc_token = r_doc.json()["access_token"]
        doc_headers = {"Authorization": f"Bearer {doc_token}"}
        r = client.get("/dashboards/doctor", headers=doc_headers)
        if r.status_code == 200:
            dd = r.json()
            log(f"  Doctor's patients: {dd.get('my_patients','?')}")
            log(f"  Total follow-ups: {dd.get('pending_follow_ups','?')}")
            log(f"  Upcoming: {dd.get('upcoming_follow_ups','?')}")
            log(f"  Completed: {dd.get('completed_follow_ups','?')}")
            log(f"  Missed: {dd.get('missed_follow_ups','?')}")
            log(f"  Success rate: {dd.get('follow_up_success_rate','?')}%")
        else:
            log(f"  Doctor dashboard failed: {r.status_code} {r.text[:200]}")
    else:
        log(f"  Doctor login failed: {r_doc.status_code} {r_doc.text[:200]}")

    # ── Summary ──
    log("\n" + "=" * 60)
    log("TEST RESULTS SUMMARY")
    log("=" * 60)

    # Check plan completion
    r = client.get(f"/treatment-plans/{plan_id}")
    if r.status_code == 200:
        plan = r.json()
        if plan.get("status") == "COMPLETED":
            log("[PASS] STEP 3-6: Sitting completion + plan completion PASS")
            log(f"   Status={plan.get('status')} total={plan.get('total_sittings')} completed={plan.get('completed_sittings')} remaining={plan.get('remaining_sittings')} progress={plan.get('progress')}")
        else:
            log(f"[FAIL] STEP 3-6: Plan not completed - status={plan.get('status')}")

    # Check follow-ups
    r = client.get("/crm/treatment-follow-ups", params={"type": "1_DAY_FOLLOW_UP"})
    fus1d = r.json() if r.status_code == 200 else []
    r = client.get("/crm/treatment-follow-ups", params={"type": "7_DAY_FOLLOW_UP"})
    fus7d = r.json() if r.status_code == 200 else []
    if len(fus1d) >= 1:
        log(f"[PASS] STEP 4: 1-day follow-up exists: {len(fus1d)} record(s)")
    else:
        log(f"[FAIL] STEP 4: 1-day follow-up MISSING (expected >=1, got {len(fus1d)})")
    if len(fus7d) >= 1:
        log(f"[PASS] STEP 4: 7-day follow-up exists: {len(fus7d)} record(s)")
    else:
        log(f"[FAIL] STEP 4: 7-day follow-up MISSING (expected >=1, got {len(fus7d)})")

    # Check recalls
    r = client.get("/crm/recalls?type=6_MONTH_RECALL")
    rec6m = r.json() if r.status_code == 200 else []
    r = client.get("/crm/recalls?type=12_MONTH_RECALL")
    rec12m = r.json() if r.status_code == 200 else []
    if len(rec6m) >= 1:
        log(f"[PASS] STEP 7: 6-month recall exists: {len(rec6m)} record(s)")
    else:
        log(f"[FAIL] STEP 7: 6-month recall MISSING (expected >=1, got {len(rec6m)})")
    if len(rec12m) >= 1:
        log(f"[PASS] STEP 7: 12-month recall exists: {len(rec12m)} record(s)")
    else:
        log(f"[FAIL] STEP 7: 12-month recall MISSING (expected >=1, got {len(rec12m)})")

    # Check CRM rules linked by ID
    r = client.get("/crm/settings/rules")
    if r.status_code == 200:
        rules = r.json()
        id_linked = [r for r in rules if r.get("treatment_template_id")]
        if id_linked:
            log(f"[PASS] STEP 1: CRM rules linked by treatment_template_id (FK) - {len(id_linked)} rule(s)")
        else:
            log(f"[WARN] STEP 1: CRM rules exist but are NOT linked by treatment_template_id - using text matching only")
    else:
        log(f"[FAIL] STEP 1: Failed to check CRM rules")

    log("\n" + "=" * 60)
    log("END-TO-END CRM WORKFLOW TEST COMPLETE")
    log("=" * 60)

if __name__ == "__main__":
    main()
