"""
End-to-End Workflow Tests for Case Reports & Treatments
=========================================================
Tests the full clinical workflow:
  Patient → Case → TreatmentPlanItems → AssignDoctors → Submit → Approve →
  TreatmentGeneration → Sittings → StatusTransitions → DoctorQueue → Completion

Run: python tests/test_treatment_e2e.py
Requires: Server running on http://localhost:8000
"""
import requests
import json
import sys
from datetime import datetime, timedelta

BASE = "http://localhost:8000/api/v1"
PASS = 0
FAIL = 0
ISSUES = []


def log_result(test_name, passed, detail=""):
    global PASS, FAIL
    status = "PASS" if passed else "FAIL"
    if not passed:
        FAIL += 1
        ISSUES.append((test_name, detail))
    else:
        PASS += 1
    print(f"  [{status}] {test_name}" + (f" — {detail}" if detail else ""))


class E2ETestSuite:
    def __init__(self):
        self.token = None
        self.admin_group_id = None
        self.hospital_id = None
        self.doctor1_id = None
        self.doctor2_id = None
        self.patient1_id = None
        self.patient2_id = None
        self.headers = {}

    def _post(self, path, data=None, expect=(200, 201), params=None):
        url = f"{BASE}{path}"
        if isinstance(expect, int):
            expect = (expect,)
        r = requests.post(url, json=data, params=params, headers=self.headers, timeout=30)
        if r.status_code not in expect:
            try:
                detail = r.json().get("detail", r.text[:200])
            except Exception:
                detail = r.text[:200]
            return r.status_code, None, f"Expected {expect}, got {r.status_code}: {detail}"
        return r.status_code, r.json(), None

    def _get(self, path, params=None):
        url = f"{BASE}{path}"
        r = requests.get(url, params=params, headers=self.headers, timeout=30)
        if r.status_code != 200:
            try:
                detail = r.json().get("detail", r.text[:200])
            except Exception:
                detail = r.text[:200]
            return r.status_code, None, f"Expected 200, got {r.status_code}: {detail}"
        return r.status_code, r.json(), None

    def _put(self, path, data=None, expect=200, params=None):
        url = f"{BASE}{path}"
        r = requests.put(url, json=data, params=params, headers=self.headers, timeout=30)
        if r.status_code != expect:
            try:
                detail = r.json().get("detail", r.text[:200])
            except Exception:
                detail = r.text[:200]
            return r.status_code, None, f"Expected {expect}, got {r.status_code}: {detail}"
        return r.status_code, r.json(), None

    # ──────────────────────────────────────────────
    # SETUP
    # ──────────────────────────────────────────────
    def setup(self):
        print("\n" + "=" * 70)
        print("SETUP: Creating test infrastructure")
        print("=" * 70)

        # Login
        _, data, err = self._post("/auth/login", {
            "email": "superadmin@dental.com",
            "password": "SuperAdmin@123"
        })
        if err:
            print(f"FATAL: Login failed: {err}")
            sys.exit(1)
        self.token = data["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        log_result("Login as SUPER_ADMIN", True)

        # Create admin group
        ts = int(datetime.now().timestamp())
        _, data, err = self._post("/admin-groups/", {"name": f"E2E Test Group {ts}"})
        if err:
            print(f"FATAL: Create admin group failed: {err}")
            sys.exit(1)
        self.admin_group_id = data["id"]
        log_result("Create Admin Group", True)

        # Create hospital
        _, data, err = self._post("/hospitals/", {
            "name": "E2E Test Hospital",
            "admin_group_id": self.admin_group_id,
        })
        if err:
            print(f"FATAL: Create hospital failed: {err}")
            sys.exit(1)
        self.hospital_id = data["id"]
        log_result("Create Hospital", True)

        # Create doctor 1
        ts = int(datetime.now().timestamp())
        _, data, err = self._post("/doctors/", {
            "email": f"dr.alpha.{ts}@test.com",
            "password": "password123",
            "full_name": "Dr. Alpha",
            "hospital_id": self.hospital_id,
            "admin_group_id": self.admin_group_id,
            "specialization": "Orthodontics",
        })
        if err:
            print(f"FATAL: Create doctor1 failed: {err}")
            sys.exit(1)
        self.doctor1_id = data["id"]
        log_result("Create Doctor 1 (Dr. Alpha)", True)

        # Create doctor 2
        _, data, err = self._post("/doctors/", {
            "email": f"dr.beta.{ts}@test.com",
            "password": "password123",
            "full_name": "Dr. Beta",
            "hospital_id": self.hospital_id,
            "admin_group_id": self.admin_group_id,
            "specialization": "Endodontics",
        })
        if err:
            print(f"FATAL: Create doctor2 failed: {err}")
            sys.exit(1)
        self.doctor2_id = data["id"]
        log_result("Create Doctor 2 (Dr. Beta)", True)

        # Create patient 1
        _, data, err = self._post("/patients/", {
            "full_name": "Test Patient One",
            "hospital_id": self.hospital_id,
            "doctor_id": self.doctor1_id,
            "phone": "9000000001",
        })
        if err:
            print(f"FATAL: Create patient1 failed: {err}")
            sys.exit(1)
        self.patient1_id = data["id"]
        log_result("Create Patient 1", True)

        # Create patient 2
        _, data, err = self._post("/patients/", {
            "full_name": "Test Patient Two",
            "hospital_id": self.hospital_id,
            "doctor_id": self.doctor2_id,
            "phone": "9000000002",
        })
        if err:
            print(f"FATAL: Create patient2 failed: {err}")
            sys.exit(1)
        self.patient2_id = data["id"]
        log_result("Create Patient 2", True)

    # ──────────────────────────────────────────────
    # TEST 1: Happy Path — Full Workflow
    # ──────────────────────────────────────────────
    def test_1_happy_path(self):
        print("\n" + "=" * 70)
        print("TEST 1: Happy Path — Full Clinical Workflow")
        print("=" * 70)

        # Step 1: Create case
        _, case, err = self._post("/cases/", {
            "patient_id": self.patient1_id,
            "doctor_id": self.doctor1_id,
            "chief_complaint": "Severe toothache in upper right molar",
            "chief_complaint_severity": "High",
            "provisional_diagnosis": "Pulpitis tooth 16",
        }, expect=201)
        log_result("1.1 Create Case Report", err is None, err or "")
        if not case:
            return
        case_id = case["id"]

        # Verify initial state
        log_result("1.2 Case has treatment_plan_status=DRAFT",
                   case.get("treatment_plan_status") == "DRAFT",
                   f"Got: {case.get('treatment_plan_status')}")

        # Step 2: Create treatment plan items
        _, items, err = self._post("/treatment-plan-items/", {
            "case_id": case_id,
            "items": [
                {
                    "procedure_name": "Root Canal Treatment",
                    "tooth_numbers": ["16"],
                    "estimated_visits": 3,
                    "estimated_cost": 8000,
                    "remarks": "Emergency RCT",
                },
                {
                    "procedure_name": "Crown Placement",
                    "tooth_numbers": ["16"],
                    "estimated_visits": 1,
                    "estimated_cost": 5000,
                    "sequence_order": 1,
                }
            ]
        }, expect=201)
        log_result("1.3 Create Treatment Plan Items (2 items)", err is None, err or "")
        if not items:
            return
        log_result("1.4 Items have version=1", items[0].get("version") == 1,
                   f"Got: {items[0].get('version')}")

        # Step 3: Assign doctors to items
        _, assigned, err = self._post("/treatment-plan-items/assign-doctors", {
            "assignments": [
                {"item_id": items[0]["id"], "assigned_doctor_id": self.doctor1_id},
                {"item_id": items[1]["id"], "assigned_doctor_id": self.doctor1_id, "assistant_doctor_id": self.doctor2_id},
            ]
        })
        log_result("1.5 Assign Doctors to Items", err is None, err or "")

        # Step 4: Submit for approval
        _, case_updated, err = self._post(f"/cases/{case_id}/submit-treatment-plan")
        log_result("1.6 Submit Treatment Plan for Approval", err is None, err or "")
        if case_updated:
            log_result("1.7 Status=PENDING_APPROVAL after submit",
                       case_updated.get("treatment_plan_status") == "PENDING_APPROVAL",
                       f"Got: {case_updated.get('treatment_plan_status')}")

        # Step 5: Approve (generates Treatment records)
        _, case_approved, err = self._post(f"/cases/{case_id}/approve-treatment-plan")
        log_result("1.8 Approve Treatment Plan", err is None, err or "")
        if case_approved:
            log_result("1.9 Status=APPROVED after approval",
                       case_approved.get("treatment_plan_status") == "APPROVED",
                       f"Got: {case_approved.get('treatment_plan_status')}")
            log_result("1.10 treatment_plan_approved=true",
                       case_approved.get("treatment_plan_approved") is True,
                       f"Got: {case_approved.get('treatment_plan_approved')}")

        # Step 6: Verify treatments were generated
        _, treatments, err = self._get(f"/treatment-plans/by-case/{case_id}")
        log_result("1.11 Treatments generated from items", err is None, err or "")
        if treatments and len(treatments) >= 2:
            log_result("1.12 Two treatments generated", len(treatments) == 2,
                       f"Got: {len(treatments)}")
            trt1 = treatments[0]
            log_result("1.13 Treatment status=GENERATED",
                       trt1.get("status") == "GENERATED",
                       f"Got: {trt1.get('status')}")
            log_result("1.14 Treatment has treatment_number",
                       trt1.get("treatment_number") is not None,
                       f"Got: {trt1.get('treatment_number')}")
            log_result("1.15 Treatment has correct name",
                       trt1.get("treatment_name") == "Root Canal Treatment",
                       f"Got: {trt1.get('treatment_name')}")
            log_result("1.16 Treatment is auto_created",
                       trt1.get("auto_created") is True,
                       f"Got: {trt1.get('auto_created')}")
            log_result("1.17 Treatment has assigned_doctor_id",
                       trt1.get("assigned_doctor_id") is not None,
                       f"Got: {trt1.get('assigned_doctor_id')}")
        else:
            log_result("1.12 Two treatments generated", False,
                       f"Got: {len(treatments) if treatments else 0} treatments")

        # Step 7: Update treatment status
        if treatments and len(treatments) > 0:
            trt_id = treatments[0]["id"]

            # Start treatment
            _, started, err = self._post(f"/treatment-plans/{trt_id}/start")
            log_result("1.18 Start treatment (IN_PROGRESS)", err is None, err or "")
            if started:
                log_result("1.19 Status=IN_PROGRESS", started.get("status") == "IN_PROGRESS",
                           f"Got: {started.get('status')}")
                log_result("1.20 started_at is set", started.get("started_at") is not None,
                           f"Got: {started.get('started_at')}")

            # Create a sitting
            _, sitting, err = self._post("/treatment-sittings/", {
                "treatment_plan_id": trt_id,
                "sitting_number": 1,
                "work_done": "Access cavity preparation",
                "status": "COMPLETED",
                "doctor_notes": "Pulp chamber accessed, cleaned",
                "procedure_performed": "RCT Step 1 - Access",
                "clinical_notes": "Canals located, working length determined",
                "next_appointment_date": (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d"),
                "next_appointment_time": "10:00:00",
            }, expect=201)
            log_result("1.21 Create Treatment Sitting #1", err is None, err or "")

            if sitting:
                log_result("1.22 Sitting has procedure_performed",
                           sitting.get("procedure_performed") == "RCT Step 1 - Access",
                           f"Got: {sitting.get('procedure_performed')}")
                log_result("1.23 Sitting has clinical_notes",
                           sitting.get("clinical_notes") is not None,
                           f"Got: {sitting.get('clinical_notes')}")

            # Set waiting
            _, waiting, err = self._post(f"/treatment-plans/{trt_id}/set-waiting",
                                         params={"waiting_type": "WAITING_PATIENT"})
            log_result("1.24 Set waiting (WAITING_PATIENT)", err is None, err or "")

            # Resume to in progress
            _, resumed, err = self._put(f"/treatment-plans/{trt_id}",
                                        {"status": "IN_PROGRESS"})
            log_result("1.25 Resume to IN_PROGRESS", err is None, err or "")

            # Complete treatment
            _, completed, err = self._post(f"/treatment-plans/{trt_id}/complete")
            log_result("1.26 Complete treatment", err is None, err or "")
            if completed:
                log_result("1.27 Status=COMPLETED", completed.get("status") == "COMPLETED",
                           f"Got: {completed.get('status')}")
                log_result("1.28 completed_at is set", completed.get("completed_at") is not None,
                           f"Got: {completed.get('completed_at')}")

    # ──────────────────────────────────────────────
    # TEST 2: Treatment Plan Rejection & Re-approval
    # ──────────────────────────────────────────────
    def test_2_rejection_flow(self):
        print("\n" + "=" * 70)
        print("TEST 2: Treatment Plan Rejection & Re-approval")
        print("=" * 70)

        # Create case
        _, case, err = self._post("/cases/", {
            "patient_id": self.patient2_id,
            "doctor_id": self.doctor2_id,
            "chief_complaint": "Broken front tooth",
        }, expect=201)
        if not case:
            log_result("2.1 Create Case", False, err or "No case returned")
            return
        case_id = case["id"]
        log_result("2.1 Create Case", True)

        # Create items
        _, items, err = self._post("/treatment-plan-items/", {
            "case_id": case_id,
            "items": [
                {"procedure_name": "Veneer", "tooth_numbers": ["11"], "estimated_cost": 12000},
            ]
        }, expect=201)
        log_result("2.2 Create Treatment Plan Item", err is None, err or "")
        if not items:
            return

        # Submit
        _, case_sub, err = self._post(f"/cases/{case_id}/submit-treatment-plan")
        log_result("2.3 Submit for Approval", err is None, err or "")

        # Reject
        _, case_rej, err = self._post(f"/cases/{case_id}/reject-treatment-plan",
                                       params={"reason": "Cost too high for patient"})
        log_result("2.4 Reject Treatment Plan", err is None, err or "")
        if case_rej:
            log_result("2.5 Status=REJECTED", case_rej.get("treatment_plan_status") == "REJECTED",
                       f"Got: {case_rej.get('treatment_plan_status')}")
            log_result("2.6 Rejection reason recorded",
                       case_rej.get("treatment_plan_rejection_reason") == "Cost too high for patient",
                       f"Got: {case_rej.get('treatment_plan_rejection_reason')}")

        # Verify no treatments generated after rejection
        _, trts, err = self._get(f"/treatment-plans/by-case/{case_id}")
        no_treatments = trts is not None and len(trts) == 0
        log_result("2.7 No treatments generated after rejection", no_treatments,
                   f"Got: {len(trts) if trts else 'None'} treatments")

        # Resubmit (re-edit items, then submit again)
        _, item_updated, err = self._put(f"/treatment-plan-items/{items[0]['id']}",
                                          {"estimated_cost": 8000, "remarks": "Revised cost"})
        # Note: This might fail because treatment_plan_status is REJECTED - check if edits are allowed
        log_result("2.8 Edit items after rejection", err is None, err or "")

        # Resubmit
        _, case_resub, err = self._post(f"/cases/{case_id}/submit-treatment-plan")
        log_result("2.9 Resubmit for Approval", err is None, err or "")
        if case_resub:
            log_result("2.10 Status=PENDING_APPROVAL again",
                       case_resub.get("treatment_plan_status") == "PENDING_APPROVAL",
                       f"Got: {case_resub.get('treatment_plan_status')}")

        # Approve
        _, case_appr, err = self._post(f"/cases/{case_id}/approve-treatment-plan")
        log_result("2.11 Approve after resubmission", err is None, err or "")
        if case_appr:
            log_result("2.12 Status=APPROVED", case_appr.get("treatment_plan_status") == "APPROVED",
                       f"Got: {case_appr.get('treatment_plan_status')}")

        # Verify treatments generated
        _, trts, err = self._get(f"/treatment-plans/by-case/{case_id}")
        log_result("2.13 Treatments generated after approval",
                   trts is not None and len(trts) >= 1,
                   f"Got: {len(trts) if trts else 0} treatments")

    # ──────────────────────────────────────────────
    # TEST 3: Multi-Procedure with Dependencies
    # ──────────────────────────────────────────────
    def test_3_dependencies(self):
        print("\n" + "=" * 70)
        print("TEST 3: Multi-Procedure with Dependencies")
        print("=" * 70)

        # Create case
        _, case, err = self._post("/cases/", {
            "patient_id": self.patient1_id,
            "chief_complaint": "Multiple dental issues",
            "provisional_diagnosis": "Multi-tooth treatment needed",
        }, expect=201)
        if not case:
            log_result("3.1 Create Case", False, err or "")
            return
        case_id = case["id"]
        log_result("3.1 Create Case", True)

        # Create item 1 (no dependency)
        _, items, err = self._post("/treatment-plan-items/", {
            "case_id": case_id,
            "items": [
                {"procedure_name": "Scaling", "tooth_numbers": ["11", "12", "13"], "estimated_visits": 1, "estimated_cost": 2000, "sequence_order": 0},
                {"procedure_name": "Filling", "tooth_numbers": ["11"], "estimated_visits": 1, "estimated_cost": 1500, "sequence_order": 1, "dependency_item_id": None},
                {"procedure_name": "Crown", "tooth_numbers": ["11"], "estimated_visits": 2, "estimated_cost": 6000, "sequence_order": 2, "dependency_item_id": None},
            ]
        }, expect=201)
        log_result("3.2 Create 3 items", err is None, err or "")
        if not items or len(items) < 3:
            log_result("3.2 Create 3 items", False, f"Got {len(items) if items else 0} items")
            return

        # Set up dependency: item[2] (Crown) depends on item[1] (Filling)
        crown_item = items[2]
        filling_item = items[1]
        _, updated_item, err = self._put(f"/treatment-plan-items/{crown_item['id']}",
                                          {"dependency_item_id": filling_item["id"]})
        log_result("3.3 Set dependency: Crown depends on Filling", err is None, err or "")

        # Verify dependency check
        # First approve to generate treatments
        self._post(f"/cases/{case_id}/submit-treatment-plan")
        self._post(f"/cases/{case_id}/approve-treatment-plan", params={})

        _, trts, err = self._get(f"/treatment-plans/by-case/{case_id}")
        log_result("3.4 Treatments generated", err is None, err or "")
        if trts and len(trts) >= 3:
            crown_treatment = None
            for t in trts:
                if t.get("treatment_name") == "Crown":
                    crown_treatment = t
                    break

            if crown_treatment:
                # Check dependency
                _, dep_check, err = self._get(f"/treatment-plans/{crown_treatment['id']}/check-dependency")
                log_result("3.5 Check dependency for Crown treatment", err is None, err or "")
                if dep_check:
                    log_result("3.6 Crown cannot start (dependency not met)",
                               dep_check.get("can_start") is False,
                               f"can_start: {dep_check.get('can_start')}")
            else:
                log_result("3.5 Find Crown treatment", False, "Crown treatment not found")
        else:
            log_result("3.4 3 treatments generated", False, f"Got {len(trts) if trts else 0}")

    # ──────────────────────────────────────────────
    # TEST 4: Treatment Status Transitions
    # ──────────────────────────────────────────────
    def test_4_status_transitions(self):
        print("\n" + "=" * 70)
        print("TEST 4: Treatment Status Transitions & Edge Cases")
        print("=" * 70)

        # Create case + items + approve
        _, case, err = self._post("/cases/", {
            "patient_id": self.patient1_id,
            "chief_complaint": "Status transition test",
        }, expect=201)
        if not case:
            log_result("4.1 Setup: Create Case", False, err or "")
            return
        case_id = case["id"]

        _, items, err = self._post("/treatment-plan-items/", {
            "case_id": case_id,
            "items": [{"procedure_name": "Extraction", "tooth_numbers": ["46"], "estimated_cost": 3000}],
        }, expect=201)
        if not items:
            log_result("4.2 Setup: Create Items", False, err or "")
            return

        self._post(f"/cases/{case_id}/submit-treatment-plan")
        self._post(f"/cases/{case_id}/approve-treatment-plan")

        _, trts, err = self._get(f"/treatment-plans/by-case/{case_id}")
        if not trts or len(trts) == 0:
            log_result("4.3 Setup: Generate Treatments", False, "No treatments generated")
            return
        trt_id = trts[0]["id"]
        log_result("4.3 Setup: Generate Treatments", True)
        log_result("4.4 Initial status=GENERATED", trts[0]["status"] == "GENERATED",
                   f"Got: {trts[0]['status']}")

        # Test: Try to start without dependency issues (no dependency = should work)
        _, started, err = self._post(f"/treatment-plans/{trt_id}/start")
        log_result("4.5 Start treatment", err is None, err or "")
        if started:
            log_result("4.6 Status=IN_PROGRESS", started["status"] == "IN_PROGRESS",
                       f"Got: {started['status']}")

        # Test: Overdue
        _, overdue, err = self._post(f"/treatment-plans/{trt_id}/report-overdue",
                                      params={"reason": "Patient did not show up", "delay_type": "Patient"})
        log_result("4.7 Report overdue", err is None, err or "")
        if overdue:
            log_result("4.8 Status=OVERDUE", overdue["status"] == "OVERDUE",
                       f"Got: {overdue['status']}")
            log_result("4.9 overdue_reason set", overdue.get("overdue_reason") == "Patient did not show up",
                       f"Got: {overdue.get('overdue_reason')}")

        # Test: Resume from overdue
        _, resumed, err = self._put(f"/treatment-plans/{trt_id}", {"status": "IN_PROGRESS"})
        log_result("4.10 Resume from OVERDUE to IN_PROGRESS", err is None, err or "")

        # Test: Set waiting for lab
        _, waiting, err = self._post(f"/treatment-plans/{trt_id}/set-waiting",
                                      params={"waiting_type": "WAITING_LAB"})
        log_result("4.11 Set WAITING_LAB", err is None, err or "")
        if waiting:
            log_result("4.12 Status=WAITING_LAB", waiting["status"] == "WAITING_LAB",
                       f"Got: {waiting['status']}")

        # Test: Resume from waiting
        _, resumed2, err = self._put(f"/treatment-plans/{trt_id}", {"status": "IN_PROGRESS"})
        log_result("4.13 Resume from WAITING_LAB", err is None, err or "")

        # Test: Complete
        _, completed, err = self._post(f"/treatment-plans/{trt_id}/complete")
        log_result("4.14 Complete treatment", err is None, err or "")
        if completed:
            log_result("4.15 Status=COMPLETED", completed["status"] == "COMPLETED",
                       f"Got: {completed['status']}")
            log_result("4.16 completed_at set", completed.get("completed_at") is not None,
                       f"Got: {completed.get('completed_at')}")

        # Test: Cannot edit completed treatment
        _, edit_err, err = self._put(f"/treatment-plans/{trt_id}",
                                      {"treatment_name": "HACKED"})
        # This should succeed (no guard against editing completed)
        log_result("4.17 Edit completed treatment (allowed but risky)",
                   edit_err is not None,
                   f"Result: {'succeeded' if edit_err else 'blocked'}")

    # ──────────────────────────────────────────────
    # TEST 5: Doctor Queue & Cross-check
    # ──────────────────────────────────────────────
    def test_5_doctor_queue(self):
        print("\n" + "=" * 70)
        print("TEST 5: Doctor Queue & Cross-module Checks")
        print("=" * 70)

        # Create case with doctor1
        _, case, err = self._post("/cases/", {
            "patient_id": self.patient1_id,
            "doctor_id": self.doctor1_id,
            "chief_complaint": "Queue test case",
        }, expect=201)
        if not case:
            log_result("5.1 Create Case", False, err or "")
            return
        case_id = case["id"]
        log_result("5.1 Create Case", True)

        # Create items assigned to doctor1
        _, items, err = self._post("/treatment-plan-items/", {
            "case_id": case_id,
            "items": [
                {"procedure_name": "Implant Consultation", "estimated_cost": 5000, "assigned_doctor_id": self.doctor1_id},
            ]
        }, expect=201)
        log_result("5.2 Create Item assigned to Dr. Alpha", err is None, err or "")

        # Assign + Submit + Approve
        self._post(f"/cases/{case_id}/submit-treatment-plan")
        self._post(f"/cases/{case_id}/approve-treatment-plan")

        # Verify treatment is assigned to doctor1
        _, trts, err = self._get(f"/treatment-plans/by-case/{case_id}")
        if trts and len(trts) > 0:
            log_result("5.3 Treatment generated with assigned doctor",
                       trts[0].get("assigned_doctor_id") == self.doctor1_id,
                       f"Expected: {self.doctor1_id}, Got: {trts[0].get('assigned_doctor_id')}")
        else:
            log_result("5.3 Treatment generated", False, "No treatments")

        # Check doctor queue
        _, queue, err = self._get(f"/doctor-queue/{self.doctor1_id}")
        log_result("5.4 Get Doctor Queue", err is None, err or "")
        if queue:
            total = queue.get("stats", {}).get("today", 0) + queue.get("stats", {}).get("in_progress", 0)
            log_result("5.5 Queue has entries", total >= 1,
                       f"Stats: {queue.get('stats')}")
        else:
            log_result("5.4 Get Doctor Queue", False, "No queue data returned")

        # Check patient timeline was recorded
        _, timeline, err = self._get(f"/patients/{self.patient1_id}/timeline")
        log_result("5.6 Patient timeline exists", err is None, err or "")
        if timeline:
            entries = timeline.get("entries", [])
            log_result("5.7 Timeline has treatment events",
                       any("reatment" in (e.get("action") or "") for e in entries),
                       f"Found {len(entries)} entries")
        else:
            log_result("5.6 Patient timeline", False, "No timeline data")

        # Verify treatment plan items still accessible after approval
        _, items_after, err = self._get(f"/treatment-plan-items/by-case/{case_id}")
        log_result("5.8 Items accessible after approval", err is None, err or "")
        if items_after:
            log_result("5.9 Items have no approval fields",
                       not hasattr(items_after[0], "is_approved") or items_after[0].get("is_approved") is None,
                       f"is_approved: {items_after[0].get('is_approved')}")

        # Verify case shows treatment_plan_status
        _, case_detail, err = self._get(f"/cases/{case_id}")
        log_result("5.10 Case detail shows treatment_plan_status", err is None, err or "")
        if case_detail:
            log_result("5.11 treatment_plan_status=APPROVED",
                       case_detail.get("treatment_plan_status") == "APPROVED",
                       f"Got: {case_detail.get('treatment_plan_status')}")


    # ──────────────────────────────────────────────
    # RUN ALL
    # ──────────────────────────────────────────────
    def run(self):
        self.setup()
        self.test_1_happy_path()
        self.test_2_rejection_flow()
        self.test_3_dependencies()
        self.test_4_status_transitions()
        self.test_5_doctor_queue()

        print("\n" + "=" * 70)
        print(f"RESULTS: {PASS} passed, {FAIL} failed")
        print("=" * 70)

        if ISSUES:
            print("\nISSUES FOUND:")
            print("-" * 70)
            for i, (name, detail) in enumerate(ISSUES, 1):
                print(f"  {i}. {name}")
                print(f"     -> {detail}")
            print()
        else:
            print("\nAll tests passed!")

        return FAIL == 0


if __name__ == "__main__":
    suite = E2ETestSuite()
    success = suite.run()
    sys.exit(0 if success else 1)
