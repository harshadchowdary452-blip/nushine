"""
13 Runtime Scenarios — CRM Automation Architecture Verification
Uses REAL entity IDs from the database.
"""
import asyncio
import httpx
from datetime import date, timedelta, datetime, timezone
from jose import jwt

BASE = "http://localhost:8000"
HOSPITAL_ID = "2e0920f1-be0d-4cf0-a2f5-e103397c623f"
USER_ID = "778b6936-0f6d-469a-a72f-a9a764b95170"
SECRET = "CHANGE-ME-IN-PRODUCTION"
ALGORITHM = "HS256"

PATIENT_ID = "58ee2f8c-321d-4dc6-a8d0-7c3a036699ff"
LEAD_ID = "f596ebf9-c5d3-456d-aeef-0e7ef73ccf64"
CASE_ID = "cd73c54a-5b88-4ad4-b30f-dc05bd94e9f2"
DOCTOR_ID = "edc06c83-adb3-4df9-85b9-78e228f6502f"
PLAN_ID = "dc0cc9ba-044d-4e93-a131-0142623e7181"

def get_token():
    payload = {
        "sub": USER_ID, "hospital_id": HOSPITAL_ID, "role": "HOSPITAL_ADMIN",
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)

TOKEN = get_token()
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

results = []

async def run_scenario(num, name, event_type, entity_type, entity_id, hospital_id, payload, expected_decisions, expected_created):
    async with httpx.AsyncClient() as c:
        body = {
            "event_type": event_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "hospital_id": hospital_id,
            "payload": payload,
        }
        r = await c.post(f"{BASE}/api/v1/crm/test/event", json=body, headers=HEADERS, timeout=30)
        data = r.json()
        resp = data.get("data", {})
        decisions = resp.get("decisions", [])
        exec_results = resp.get("execution_results", [])
        created = sum(e.get("enquiries_created", 0) for e in exec_results)
        skipped = sum(e.get("enquiries_skipped", 0) for e in exec_results)
        dupes = sum(e.get("duplicate_prevented", 0) for e in exec_results)
        errors = []
        for e in exec_results:
            errors.extend(e.get("errors", []))
        decision_types = [d.get("enquiry_type") for d in decisions]

        passed = len(decisions) == expected_decisions and created == expected_created
        status = "PASS" if passed else "FAIL"
        results.append({
            "num": num, "name": name, "status": status,
            "decisions": len(decisions), "expected_decisions": expected_decisions,
            "created": created, "expected_created": expected_created,
            "skipped": skipped, "dupes": dupes, "decision_types": decision_types,
        })

        icon = "PASS" if passed else "FAIL"
        print(f"[{icon}] Scenario {num}: {name}")
        print(f"   Decisions: {len(decisions)} (exp {expected_decisions}) types={decision_types}")
        print(f"   Created: {created} (exp {expected_created}), Skipped: {skipped}, Dupes: {dupes}")
        if errors:
            print(f"   Errors: {errors[0][:150]}")
        print()


async def main():
    print("=" * 70)
    print("CRM AUTOMATION - 13 RUNTIME SCENARIOS (Real IDs)")
    print("=" * 70)
    print()

    # S1: Lead Created -> 1 LEAD_FOLLOW_UP
    await run_scenario(
        1, "Lead -> 1 LEAD_FOLLOW_UP",
        "LEAD_CREATED", "LEAD", LEAD_ID, HOSPITAL_ID,
        {"lead_id": LEAD_ID, "patient_id": PATIENT_ID, "status": "NEW", "source": "WEBSITE"},
        expected_decisions=1, expected_created=1,
    )

    # S2: Lead Converted -> 0 new, cancels existing
    await run_scenario(
        2, "Lead Converted -> cancel existing",
        "LEAD_CONVERTED", "LEAD", LEAD_ID, HOSPITAL_ID,
        {"lead_id": LEAD_ID, "patient_id": PATIENT_ID},
        expected_decisions=1, expected_created=0,
    )

    # S3: Patient Registered -> 0
    await run_scenario(
        3, "Patient Registered -> 0",
        "PATIENT_REGISTERED", "PATIENT", PATIENT_ID, HOSPITAL_ID,
        {"patient_id": PATIENT_ID},
        expected_decisions=0, expected_created=0,
    )

    # S4: Future Appointment Created -> 1 APPOINTMENT_REMINDER
    future_date = (date.today() + timedelta(days=7)).isoformat()
    await run_scenario(
        4, "Future Appt -> 1 APPOINTMENT_REMINDER",
        "APPOINTMENT_CREATED", "APPOINTMENT", "99a25c8a-7a9f-42bf-b371-18a4e922ddc3", HOSPITAL_ID,
        {"appointment_id": "99a25c8a-7a9f-42bf-b371-18a4e922ddc3", "patient_id": PATIENT_ID,
         "appointment_date": future_date, "status": "SCHEDULED", "doctor_id": DOCTOR_ID},
        expected_decisions=1, expected_created=1,
    )

    # S5: Appointment Cancelled -> cancels reminders
    await run_scenario(
        5, "Appt Cancelled -> cancel reminders",
        "APPOINTMENT_CANCELLED", "APPOINTMENT", "99a25c8a-7a9f-42bf-b371-18a4e922ddc3", HOSPITAL_ID,
        {"appointment_id": "99a25c8a-7a9f-42bf-b371-18a4e922ddc3", "patient_id": PATIENT_ID},
        expected_decisions=1, expected_created=0,
    )

    # S6: Treatment Visit 1 with future appt -> 1 reminder, 0 wellness
    await run_scenario(
        6, "Visit 1 + future appt -> 1 reminder",
        "TREATMENT_VISIT_COMPLETED", "TREATMENT", PLAN_ID, HOSPITAL_ID,
        {"patient_id": PATIENT_ID, "treatment_plan_id": PLAN_ID, "case_id": CASE_ID,
         "treatment_type_id": None, "doctor_id": DOCTOR_ID, "sitting_number": 1},
        expected_decisions=1, expected_created=1,
    )

    # S7: Treatment Visit 2 with future appt -> same (idempotent, duplicate prevented)
    await run_scenario(
        7, "Visit 2 + future appt -> 1 decision, 0 created (dup prevented)",
        "TREATMENT_VISIT_COMPLETED", "TREATMENT", PLAN_ID, HOSPITAL_ID,
        {"patient_id": PATIENT_ID, "treatment_plan_id": PLAN_ID, "case_id": CASE_ID,
         "treatment_type_id": None, "doctor_id": DOCTOR_ID, "sitting_number": 2},
        expected_decisions=1, expected_created=0,
    )

    # S8: Final visit, no future appt -> 1 TREATMENT_WELLNESS
    # First cancel future appointment to simulate no future appt
    await run_scenario(
        "8a", "Cancel future appt for scenario 8",
        "APPOINTMENT_CANCELLED", "APPOINTMENT", "55ef084d-a200-47b2-8048-9f5a88dc55f3", HOSPITAL_ID,
        {"appointment_id": "55ef084d-a200-47b2-8048-9f5a88dc55f3", "patient_id": PATIENT_ID},
        expected_decisions=1, expected_created=0,
    )
    # S8: Treatment Completed WITH future appt -> 1 APPOINTMENT_REMINDER
    # Note: S8a only cancels the enquiry, not the actual appointment record
    await run_scenario(
        8, "Treatment Completed + future appt -> 1 reminder",
        "TREATMENT_COMPLETED", "TREATMENT", PLAN_ID, HOSPITAL_ID,
        {"patient_id": PATIENT_ID, "treatment_plan_id": PLAN_ID, "case_id": CASE_ID,
         "treatment_type_id": None, "treatment_name": "Crown", "doctor_id": DOCTOR_ID},
        expected_decisions=1, expected_created=1,
    )

    # S9: Case Completed -> 1 CASE_WELLNESS + 1 RECALL
    await run_scenario(
        9, "Case Complete -> 1 wellness + 1 recall",
        "CASE_COMPLETED", "CASE", CASE_ID, HOSPITAL_ID,
        {"case_id": CASE_ID, "patient_id": PATIENT_ID, "treatment_type_id": None},
        expected_decisions=2, expected_created=2,
    )

    # S10: Case Completed again -> 0 (duplicate prevention)
    await run_scenario(
        10, "Case Complete duplicate -> 0",
        "CASE_COMPLETED", "CASE", CASE_ID, HOSPITAL_ID,
        {"case_id": CASE_ID, "patient_id": PATIENT_ID, "treatment_type_id": None},
        expected_decisions=0, expected_created=0,
    )

    # S11: Patient Inactive -> cancels all
    await run_scenario(
        11, "Patient Inactive -> cancels all",
        "PATIENT_INACTIVE", "PATIENT", PATIENT_ID, HOSPITAL_ID,
        {"patient_id": PATIENT_ID},
        expected_decisions=1, expected_created=0,
    )

    # S12: Missed Appointment -> 1 MISSED_APPOINTMENT
    await run_scenario(
        12, "Missed Appt -> 1 MISSED_APPOINTMENT",
        "APPOINTMENT_MISSED", "APPOINTMENT", "99a25c8a-7a9f-42bf-b371-18a4e922ddc3", HOSPITAL_ID,
        {"appointment_id": "99a25c8a-7a9f-42bf-b371-18a4e922ddc3", "patient_id": PATIENT_ID},
        expected_decisions=1, expected_created=1,
    )

    # S13: Unrelated event -> 0
    await run_scenario(
        13, "Unrelated event (PAYMENT_RECEIVED) -> 0",
        "PAYMENT_RECEIVED", "PATIENT", PATIENT_ID, HOSPITAL_ID,
        {"patient_id": PATIENT_ID},
        expected_decisions=0, expected_created=0,
    )

    print("=" * 70)
    passed = sum(1 for r in results if r["status"] == "PASS")
    total = len(results)
    print(f"RESULTS: {passed}/{total} PASSED")
    if passed == total:
        print("ALL SCENARIOS PASSED!")
    else:
        print("FAILURES:")
        for r in results:
            if r["status"] == "FAIL":
                print(f"  FAIL S{r['num']}: {r['name']} -- exp {r['expected_decisions']} decisions/{r['expected_created']} created, got {r['decisions']}/{r['created']}")
    print("=" * 70)


asyncio.run(main())
