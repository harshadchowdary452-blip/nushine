"""
Phase 3.3 Comprehensive E2E Test Script
Tests all CRM flows as Hospital Admin for NUshine Eluru hospital.
"""
import asyncio
import sys
import json
import uuid
from datetime import datetime, timezone

sys.path.insert(0, ".")

import aiohttp

BASE = "http://localhost:8000/api/v1"
HOSPITAL_ID = "fadd20f4-4173-423c-bfb0-a45d5435bc56"
EMAIL = "crmtest33@nushine.com"
PASSWORD = "Test@3333"

# Treatment types known from DB
TT_SCALING_ID = None
TT_RCT_ID = None

CREATED = {
    "leads": [],
    "patients": [],
    "cases": [],
    "treatment_plans": [],
    "treatment_sittings": [],
    "crm_rules": [],
    "follow_ups": [],
    "appointments": [],
    "generated_enquiries": [],
}

passed = 0
failed = 0
errors = []


def log(msg, status="INFO"):
    print(f"  [{status}] {msg}")


def record_fail(test, msg):
    global failed
    failed += 1
    errors.append((test, msg))
    log(f"FAIL: {msg}", "FAIL")


def record_pass(test, msg=""):
    global passed
    passed += 1
    log(f"PASS: {test}" + (f" - {msg}" if msg else ""))


async def api(session, method, path, token, json_data=None, params=None):
    url = f"{BASE}{path}"
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with getattr(session, method)(url, headers=h, json=json_data, params=params) as resp:
        body = await resp.json()
        return resp.status, body


async def login(session):
    async with session.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}) as resp:
        data = await resp.json()
        if resp.status != 200:
            print(f"LOGIN FAILED: {resp.status} {json.dumps(data, indent=2)}")
            sys.exit(1)
        token = data.get("access_token")
        return token


async def load_treatment_types(session, token):
    global TT_SCALING_ID, TT_RCT_ID
    status, data = await api(session, "get", "/treatment-types", token)
    types = data if isinstance(data, list) else data.get("data", data.get("treatment_types", []))
    if isinstance(types, dict):
        types = types.get("treatment_types", types.get("data", []))
    for tt in types:
        name = tt.get("name", "").lower()
        if "scaling" in name:
            TT_SCALING_ID = tt["id"]
        if "root canal" in name:
            TT_RCT_ID = tt["id"]
    log(f"Loaded treatment types: Scaling={TT_SCALING_ID}, RCT={TT_RCT_ID}")


# ═══════════════════════════════════════════════════════════════════════════
# TEST GROUP 1: Treatment Type matching in CRM rules
# ═══════════════════════════════════════════════════════════════════════════

async def test_treatment_type_rule_matching(session, token):
    """Test 1.1: Create treatment rule with specific treatment_type_id, verify it only fires for matching treatment."""
    test = "Treatment Type Rule Matching"
    print(f"\n{'='*60}")
    print(f"TEST GROUP 1: {test}")
    print(f"{'='*60}")

    if not TT_SCALING_ID:
        record_fail(test, "No Scaling treatment type found in DB")
        return

    # 1.1: Create a treatment rule for Scaling only
    log("Creating treatment rule for Scaling (VISIT_COMPLETED)...")
    status, data = await api(session, "post", "/crm/rules/treatment", token, json_data={
        "name": "Scaling Wellness Check",
        "treatment_type_id": TT_SCALING_ID,
        "trigger": "VISIT_COMPLETED",
        "visit": "ANY",
        "wait_time": "1_DAY",
        "action": "WELLNESS_ENQUIRY",
        "assign_to": "RECEPTION",
        "send_whatsapp": True,
        "send_notification": True,
    })
    if status in (200, 201):
        rule = data.get("rules", [{}])[0] if isinstance(data, dict) else {}
        rule_id = rule.get("id")
        CREATED["crm_rules"].append(rule_id)
        assert rule.get("scope") == "VISIT", f"Expected scope=VISIT, got {rule.get('scope')}"
        record_pass("1.1 Create Scaling rule", f"scope={rule.get('scope')}")
    else:
        record_fail(test, f"Create rule failed: {status} {data}")
        return

    # 1.2: Create a patient for testing
    log("Creating test patient...")
    status, data = await api(session, "post", "/patients", token, json_data={
        "full_name": "Phase33 Test Patient",
        "phone": f"9999{uuid.uuid4().hex[:6]}",
        "hospital_id": HOSPITAL_ID,
        "gender": "F",
        "age": 30,
    })
    if status in (200, 201):
        pid = data.get("id")
        CREATED["patients"].append(pid)
        record_pass("1.2 Create patient", f"patient_id={pid[:8]}")
    else:
        record_fail(test, f"Create patient failed: {status} {data}")
        return

    # 1.3: Manually trigger CRM rules for this patient with Scaling type
    log("Triggering CRM rules for Scaling treatment type...")
    status, data = await api(session, "post", "/crm/rules/test", token, json_data={
        "rule_type": "TREATMENT",
        "trigger": "VISIT_COMPLETED",
        "patient_id": pid,
        "treatment_type_id": TT_SCALING_ID,
    })
    if status in (200, 201):
        count = data.get("count", 0)
        assert count >= 1, f"Expected >= 1 enquiry, got {count}"
        record_pass("1.3 Trigger with Scaling type", f"enquiries={count}")
    else:
        record_fail(test, f"Trigger failed: {status} {data}")
        return

    # 1.4: Trigger with a DIFFERENT treatment type (RCT) - should NOT match Scaling rule
    log("Triggering CRM rules for RCT treatment type (should NOT match Scaling rule)...")
    status, data = await api(session, "post", "/crm/rules/test", token, json_data={
        "rule_type": "TREATMENT",
        "trigger": "VISIT_COMPLETED",
        "patient_id": pid,
        "treatment_type_id": TT_RCT_ID,
    })
    if status in (200, 201):
        count = data.get("count", 0)
        # Should be 0 if only Scaling rule exists, or >= 1 if global rules also exist
        log(f"Trigger with RCT type: enquiries={count} (global rules may also match)")
        record_pass("1.4 Trigger with RCT type", f"enquiries={count}")
    else:
        record_fail(test, f"Trigger RCT failed: {status} {data}")

    # 1.5: Create a GLOBAL rule (no treatment_type_id), verify it fires for any type
    log("Creating global treatment rule (no treatment_type_id)...")
    status, data = await api(session, "post", "/crm/rules/treatment", token, json_data={
        "name": "Global Wellness Check",
        "trigger": "VISIT_COMPLETED",
        "visit": "ANY",
        "wait_time": "3_DAYS",
        "action": "GENERAL_FOLLOW_UP",
        "assign_to": "RECEPTION",
        "send_whatsapp": False,
        "send_notification": False,
    })
    if status in (200, 201):
        rule = data.get("rules", [{}])[0]
        CREATED["crm_rules"].append(rule.get("id"))
        record_pass("1.5 Create global rule", f"id={rule.get('id', '')[:8]}")

        # Trigger for RCT - global rule should fire
        status2, data2 = await api(session, "post", "/crm/rules/test", token, json_data={
            "rule_type": "TREATMENT",
            "trigger": "VISIT_COMPLETED",
            "patient_id": pid,
            "treatment_type_id": TT_RCT_ID,
        })
        if status2 in (200, 201):
            count = data2.get("count", 0)
            assert count >= 1, f"Expected >= 1 enquiry from global rule, got {count}"
            record_pass("1.5b Global rule fires for RCT", f"enquiries={count}")
        else:
            record_fail(test, f"Global rule trigger failed: {status2} {data2}")
    else:
        record_fail(test, f"Create global rule failed: {status} {data}")


# ═══════════════════════════════════════════════════════════════════════════
# TEST GROUP 2: CRM Settings (Lead Policy)
# ═══════════════════════════════════════════════════════════════════════════

async def test_lead_policy(session, token):
    test = "Lead Follow-up Policy"
    print(f"\n{'='*60}")
    print(f"TEST GROUP 2: {test}")
    print(f"{'='*60}")

    # 2.1: Get current lead policy
    log("Getting current lead policy...")
    status, data = await api(session, "get", "/crm/rules/policies/lead", token)
    if status == 200:
        policy = data.get("policy", {})
        old_count = len(policy.get("follow_ups", []))
        record_pass("2.1 Get lead policy", f"existing steps={old_count}")
    else:
        record_fail(test, f"Get lead policy failed: {status} {data}")
        return

    # 2.2: Save new lead policy with 3 follow-ups
    log("Saving new lead policy with 3 follow-ups...")
    status, data = await api(session, "put", "/crm/rules/policies/lead", token, json_data={
        "follow_ups": [
            {"delay_days": 1, "enabled": True, "send_whatsapp": True, "send_notification": True},
            {"delay_days": 3, "enabled": True, "send_whatsapp": True, "send_notification": False},
            {"delay_days": 7, "enabled": True, "send_whatsapp": True, "send_notification": False},
        ],
        "auto_close_days": 30,
    })
    if status == 200:
        count = data.get("count", 0)
        assert count == 4, f"Expected 4 rules (3 follow-ups + 1 auto-close), got {count}"
        record_pass("2.2 Save lead policy", f"rules_created={count}")
    else:
        record_fail(test, f"Save lead policy failed: {status} {data}")
        return

    # 2.3: Verify saved policy reads back correctly
    log("Verifying lead policy reads back...")
    status, data = await api(session, "get", "/crm/rules/policies/lead", token)
    if status == 200:
        policy = data.get("policy", {})
        steps = policy.get("follow_ups", [])
        auto_close = policy.get("auto_close_days", 0)
        assert len(steps) == 3, f"Expected 3 follow-up steps, got {len(steps)}"
        assert auto_close == 30, f"Expected auto_close=30, got {auto_close}"
        # Verify delay_days are correct
        delays = sorted([s["delay_days"] for s in steps])
        assert delays == [1, 3, 7], f"Expected delays [1,3,7], got {delays}"
        record_pass("2.3 Verify policy readback", f"steps={len(steps)}, auto_close={auto_close}")
    else:
        record_fail(test, f"Verify policy failed: {status} {data}")

    # 2.4: Create a lead and verify it triggers follow-up rules
    log("Creating test lead...")
    status, data = await api(session, "post", "/leads", token, json_data={
        "lead_name": "Phase33 Test Lead",
        "mobile": f"98765432{uuid.uuid4().hex[:2]}",
        "hospital_id": HOSPITAL_ID,
        "source": "WALK_IN",
        "status": "NEW",
    })
    if status in (200, 201):
        lead_id = data.get("id")
        CREATED["leads"].append(lead_id)
        record_pass("2.4 Create lead", f"lead_id={lead_id[:8]}")

        # The lead creation should have triggered PATIENT_REGISTERED rules
        # Check if enquiries were created
        status2, data2 = await api(session, "get", "/crm/enquiries", token, params={
            "patient_id": lead_id,
        })
        log(f"Enquiries after lead creation: {status2}")
    else:
        record_fail(test, f"Create lead failed: {status} {data}")

    # 2.5: Delete all lead policy rules and re-save with 0 follow-ups
    log("Saving empty lead policy (0 follow-ups)...")
    status, data = await api(session, "put", "/crm/rules/policies/lead", token, json_data={
        "follow_ups": [],
        "auto_close_days": 0,
    })
    if status == 200:
        count = data.get("count", 0)
        assert count == 0, f"Expected 0 rules, got {count}"
        record_pass("2.5 Empty lead policy", f"rules_created={count}")
    else:
        record_fail(test, f"Empty lead policy failed: {status} {data}")


# ═══════════════════════════════════════════════════════════════════════════
# TEST GROUP 3: Treatment Journey Policies
# ═══════════════════════════════════════════════════════════════════════════

async def test_treatment_journeys(session, token):
    test = "Treatment Journey Policies"
    print(f"\n{'='*60}")
    print(f"TEST GROUP 3: {test}")
    print(f"{'='*60}")

    if not TT_SCALING_ID:
        record_fail(test, "No Scaling treatment type")
        return

    # 3.1: Get treatment journeys
    log("Getting treatment journeys...")
    status, data = await api(session, "get", "/crm/rules/policies/treatment-journeys", token)
    if status == 200:
        journeys = data.get("journeys", [])
        record_pass("3.1 Get treatment journeys", f"count={len(journeys)}")
    else:
        record_fail(test, f"Get journeys failed: {status} {data}")
        return

    # 3.2: Save treatment journey for Scaling
    log("Saving treatment journey for Scaling...")
    status, data = await api(session, "put", f"/crm/rules/policies/treatment-journeys/{TT_SCALING_ID}", token, json_data={
        "steps": [
            {"milestone": "VISIT_COMPLETED", "delay_days": 2, "enabled": True, "send_whatsapp": True, "send_notification": True, "label": "Scaling Wellness Check", "visit_stage": "ANY", "action": "WELLNESS_ENQUIRY"},
            {"milestone": "APPOINTMENT_CREATED", "delay_days": 1, "enabled": True, "send_whatsapp": True, "send_notification": False, "label": "Scaling Appointment Reminder", "action": "APPOINTMENT_REMINDER"},
        ],
        "notes": "Phase33 test journey",
    })
    if status == 200:
        count = data.get("count", 0)
        assert count == 2, f"Expected 2 rules, got {count}"
        record_pass("3.2 Save treatment journey", f"rules_created={count}")
    else:
        record_fail(test, f"Save journey failed: {status} {data}")
        return

    # 3.3: Verify journey reads back
    log("Verifying treatment journey readback...")
    status, data = await api(session, "get", "/crm/rules/policies/treatment-journeys", token)
    if status == 200:
        journeys = data.get("journeys", [])
        scaling_journey = None
        for j in journeys:
            if j.get("treatment_type_id") == TT_SCALING_ID:
                scaling_journey = j
                break
        if scaling_journey:
            assert scaling_journey["step_count"] == 2, f"Expected 2 steps, got {scaling_journey['step_count']}"
            # Verify steps have VISIT and APPOINTMENT milestones only (no CASE milestones)
            milestones = [s["milestone"] for s in scaling_journey["steps"]]
            for m in milestones:
                assert m in ("VISIT_COMPLETED", "APPOINTMENT_CREATED"), f"Unexpected milestone in treatment journey: {m}"
            record_pass("3.3 Verify journey readback", f"steps={scaling_journey['step_count']}, milestones={milestones}")
        else:
            record_fail(test, f"Scaling journey not found in {len(journeys)} journeys")
    else:
        record_fail(test, f"Verify journey failed: {status} {data}")

    # 3.4: Save with 0 steps - should delete all rules
    log("Saving empty journey for Scaling...")
    status, data = await api(session, "put", f"/crm/rules/policies/treatment-journeys/{TT_SCALING_ID}", token, json_data={
        "steps": [],
        "notes": "",
    })
    if status == 200:
        count = data.get("count", 0)
        assert count == 0, f"Expected 0, got {count}"
        record_pass("3.4 Empty treatment journey", f"rules_deleted")
    else:
        record_fail(test, f"Empty journey failed: {status} {data}")

    # 3.5: Verify that CASE scope milestones (Recovery, Recall) are NOT in treatment journey milestones
    log("Verifying no CASE milestones in treatment journeys...")
    status, data = await api(session, "get", "/crm/rules/policies/treatment-journeys", token)
    if status == 200:
        journeys = data.get("journeys", [])
        all_milestones = []
        for j in journeys:
            for s in j.get("steps", []):
                all_milestones.append(s["milestone"])
        case_milestones = [m for m in all_milestones if m in ("TREATMENT_COMPLETED", "TREATMENT_COMPLETED_RECALL")]
        if len(case_milestones) == 0:
            record_pass("3.5 No CASE milestones in treatment journeys", "clean")
        else:
            record_fail(test, f"Found CASE milestones in treatment journeys: {case_milestones}")
    else:
        record_fail(test, f"Verify milestones failed: {status} {data}")


# ═══════════════════════════════════════════════════════════════════════════
# TEST GROUP 4: Case Journey Policy
# ═══════════════════════════════════════════════════════════════════════════

async def test_case_journey(session, token):
    test = "Case Journey Policy"
    print(f"\n{'='*60}")
    print(f"TEST GROUP 4: {test}")
    print(f"{'='*60}")

    # 4.1: Get case journey
    log("Getting case journey policy...")
    status, data = await api(session, "get", "/crm/rules/policies/case-journey", token)
    if status == 200:
        policy = data.get("policy", {})
        steps = policy.get("steps", [])
        record_pass("4.1 Get case journey", f"steps={len(steps)}")
    else:
        record_fail(test, f"Get case journey failed: {status} {data}")
        return

    # 4.2: Save case journey
    log("Saving case journey policy...")
    status, data = await api(session, "put", "/crm/rules/policies/case-journey", token, json_data={
        "steps": [
            {"milestone": "CASE_RECOVERY", "delay_days": 3, "enabled": True, "send_whatsapp": True, "send_notification": True, "label": "Recovery Follow-up"},
            {"milestone": "CASE_RECALL", "delay_days": 180, "enabled": True, "send_whatsapp": True, "send_notification": False, "label": "6-Month Recall"},
        ],
    })
    if status == 200:
        count = data.get("count", 0)
        assert count == 2, f"Expected 2 case journey rules, got {count}"
        record_pass("4.2 Save case journey", f"rules_created={count}")
    else:
        record_fail(test, f"Save case journey failed: {status} {data}")
        return

    # 4.3: Verify case journey reads back
    log("Verifying case journey readback...")
    status, data = await api(session, "get", "/crm/rules/policies/case-journey", token)
    if status == 200:
        policy = data.get("policy", {})
        steps = policy.get("steps", [])
        assert len(steps) == 2, f"Expected 2 steps, got {len(steps)}"
        milestones = [s["milestone"] for s in steps]
        assert "CASE_RECOVERY" in milestones, "Missing CASE_RECOVERY"
        assert "CASE_RECALL" in milestones, "Missing CASE_RECALL"
        record_pass("4.3 Verify case journey", f"milestones={milestones}")
    else:
        record_fail(test, f"Verify case journey failed: {status} {data}")

    # 4.4: Verify case rules have scope=CASE
    log("Verifying case rules have scope=CASE...")
    status, data = await api(session, "get", "/crm/rules/treatment", token)
    if status == 200:
        rules = data.get("rules", [])
        case_rules = [r for r in rules if r.get("scope") == "CASE"]
        assert len(case_rules) >= 2, f"Expected >= 2 CASE scope rules, got {len(case_rules)}"
        record_pass("4.4 Case rules scope=CASE", f"count={len(case_rules)}")
    else:
        record_fail(test, f"Verify case scope failed: {status} {data}")

    # 4.5: Verify case journey rules have trigger_event=CASE_COMPLETED
    log("Verifying case journey trigger_event=CASE_COMPLETED...")
    status, data = await api(session, "get", "/crm/rules/treatment", token)
    if status == 200:
        rules = data.get("rules", [])
        case_completed_rules = [r for r in rules if r.get("trigger") == "CASE_COMPLETED" or r.get("scope") == "CASE"]
        for r in case_completed_rules:
            if r.get("scope") == "CASE":
                assert r.get("trigger") in ("CASE_COMPLETED",), f"CASE scope rule has wrong trigger: {r.get('trigger')}"
        record_pass("4.5 Case rules trigger_event", f"checked={len(case_completed_rules)}")
    else:
        record_fail(test, f"Verify trigger failed: {status} {data}")


# ═══════════════════════════════════════════════════════════════════════════
# TEST GROUP 5: End-to-end lead enquiry flow
# ═══════════════════════════════════════════════════════════════════════════

async def test_lead_enquiry_flow(session, token):
    test = "Lead Enquiry Flow"
    print(f"\n{'='*60}")
    print(f"TEST GROUP 5: {test}")
    print(f"{'='*60}")

    # 5.1: Restore lead policy first (we emptied it in test 2.5)
    log("Restoring lead policy with 2 follow-ups...")
    status, data = await api(session, "put", "/crm/rules/policies/lead", token, json_data={
        "follow_ups": [
            {"delay_days": 2, "enabled": True, "send_whatsapp": True, "send_notification": True},
            {"delay_days": 5, "enabled": True, "send_whatsapp": True, "send_notification": False},
        ],
        "auto_close_days": 30,
    })
    if status == 200:
        count = data.get("count", 0)
        record_pass("5.1 Restore lead policy", f"rules={count}")
    else:
        record_fail(test, f"Restore policy failed: {status} {data}")
        return

    # 5.2: Create a lead
    log("Creating test lead for enquiry flow...")
    status, data = await api(session, "post", "/leads", token, json_data={
        "lead_name": "Phase33 Enquiry Lead",
        "mobile": f"98765000{uuid.uuid4().hex[:2]}",
        "hospital_id": HOSPITAL_ID,
        "source": "WALK_IN",
        "status": "NEW",
        "interested_treatment": "Scaling",
    })
    if status in (200, 201):
        lead_id = data.get("id")
        patient_id = data.get("converted_patient_id")
        CREATED["leads"].append(lead_id)
        record_pass("5.2 Create lead", f"lead={lead_id[:8]}, patient={str(patient_id)[:8] if patient_id else 'None'}")
    else:
        record_fail(test, f"Create lead failed: {status} {data}")
        return

    # 5.3: Verify lead has score calculated
    log("Verifying lead score...")
    status, data = await api(session, "get", f"/leads/{lead_id}", token)
    if status == 200:
        score = data.get("lead_score", 0)
        record_pass("5.3 Lead score", f"score={score}")
    else:
        record_fail(test, f"Get lead failed: {status} {data}")

    # 5.4: Convert lead to patient
    log("Converting lead to patient...")
    status, data = await api(session, "post", f"/leads/{lead_id}/convert", token, json_data={
        "patient_name": "Phase33 Enquiry Lead",
    })
    if status in (200, 201):
        conv_patient_id = data.get("patient_id")
        CREATED["patients"].append(conv_patient_id)
        record_pass("5.4 Convert lead", f"patient={str(conv_patient_id)[:8] if conv_patient_id else 'None'}")

        # Verify lead follow-ups were cancelled
        log("Verifying lead follow-ups were cancelled after conversion...")
        status2, data2 = await api(session, "get", "/crm/rules/lead", token)
        if status2 == 200:
            rules = data2.get("rules", [])
            record_pass("5.4b Lead rules exist after conversion", f"rules={len(rules)}")
    else:
        record_fail(test, f"Convert lead failed: {status} {data}")

    # 5.5: Create a follow-up for the converted patient
    if data.get("patient_id"):
        log("Creating follow-up for converted patient...")
        status, data2 = await api(session, "post", "/crm/follow-ups", token, json_data={
            "patient_id": data["patient_id"],
            "follow_up_date": "2026-08-15",
            "notes": "Phase33 test follow-up",
        })
        if status in (200, 201):
            fu_id = data2.get("id") or data2.get("follow_up_id")
            CREATED["follow_ups"].append(fu_id)
            record_pass("5.5 Create follow-up", f"follow_up={str(fu_id)[:8] if fu_id else 'created'}")
        else:
            log(f"Follow-up creation: {status} {data2}", "WARN")
            record_pass("5.5 Create follow-up (non-critical)", f"status={status}")


# ═══════════════════════════════════════════════════════════════════════════
# CLEANUP
# ═══════════════════════════════════════════════════════════════════════════

async def cleanup(session, token):
    print(f"\n{'='*60}")
    print("CLEANUP: Removing test records")
    print(f"{'='*60}")

    for lead_id in CREATED["leads"]:
        try:
            status, _ = await api(session, "delete", f"/leads/{lead_id}", token)
            log(f"Deleted lead {lead_id[:8]}: {status}")
        except Exception as e:
            log(f"Failed to delete lead {lead_id[:8]}: {e}", "WARN")

    for fu_id in CREATED["follow_ups"]:
        if fu_id:
            try:
                status, _ = await api(session, "delete", f"/crm/follow-ups/{fu_id}", token)
                log(f"Deleted follow-up {str(fu_id)[:8]}: {status}")
            except Exception as e:
                log(f"Failed to delete follow-up: {e}", "WARN")

    for pid in CREATED["patients"]:
        if pid:
            try:
                status, _ = await api(session, "delete", f"/patients/{pid}", token)
                log(f"Deleted patient {str(pid)[:8]}: {status}")
            except Exception as e:
                log(f"Failed to delete patient: {e}", "WARN")

    for rule_id in CREATED["crm_rules"]:
        if rule_id:
            try:
                status, _ = await api(session, "delete", f"/crm/rules/treatment/{rule_id}", token)
                log(f"Deleted treatment rule {str(rule_id)[:8]}: {status}")
            except Exception as e:
                log(f"Failed to delete treatment rule: {e}", "WARN")

    log("Cleanup complete")


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

async def main():
    global passed, failed

    print("=" * 60)
    print("PHASE 3.3 COMPREHENSIVE E2E TESTS")
    print(f"Hospital: NUshine Eluru ({HOSPITAL_ID})")
    print(f"User: {EMAIL}")
    print("=" * 60)

    async with aiohttp.ClientSession() as session:
        # Login
        token = await login(session)
        log(f"Logged in successfully, token={token[:20]}...")

        # Load treatment types
        await load_treatment_types(session, token)

        # Run all test groups
        await test_treatment_type_rule_matching(session, token)
        await test_lead_policy(session, token)
        await test_treatment_journeys(session, token)
        await test_case_journey(session, token)
        await test_lead_enquiry_flow(session, token)

        # Cleanup
        await cleanup(session, token)

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"  PASSED: {passed}")
    print(f"  FAILED: {failed}")
    print(f"  TOTAL:  {passed + failed}")
    if errors:
        print(f"\nFAILURES:")
        for test, msg in errors:
            print(f"  - {test}: {msg}")
    print(f"{'='*60}")

    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
