"""Phase 3A tests: laboratory master, lab-case tracking (auto-create from
WAITING_LAB), tenant scoping, WhatsApp/call logging, status flow, exports."""
from datetime import date

import pytest
from httpx import AsyncClient

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User


@pytest.fixture
async def seed(db_session):
    g1 = AdminGroup(name="Lab Test Group", description="")
    db_session.add(g1)
    await db_session.flush()
    ha = Hospital(admin_group_id=g1.id, name="Lab Hosp A")
    hb = Hospital(admin_group_id=g1.id, name="Lab Hosp B")
    db_session.add_all([ha, hb])
    await db_session.flush()

    def _user(email, name, role, hospital=None, group=None):
        return User(email=email, password_hash=hash_password("TestPass123"), full_name=name,
                    role=role, hospital_id=hospital.id if hospital else None,
                    admin_group_id=group.id if group else None,
                    is_active=True, is_verified=True)

    users = {
        "SA": _user("lab_sa@t.com", "Lab SA", Role.SUPER_ADMIN),
        "GA": _user("lab_ga@t.com", "Lab GA", Role.GROUP_ADMIN, group=g1),
        "HA": _user("lab_ha@t.com", "Lab HA", Role.HOSPITAL_ADMIN, hospital=ha, group=g1),
        "HB": _user("lab_hb@t.com", "Lab HB", Role.HOSPITAL_ADMIN, hospital=hb, group=g1),
        "DR": _user("lab_dr@t.com", "Lab Dr", Role.DOCTOR, hospital=ha, group=g1),
    }
    db_session.add_all(list(users.values()))
    await db_session.commit()
    return {"g1": g1.id, "HA_ID": ha.id, "HB_ID": hb.id,
            **{k: v.id for k, v in users.items()}}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def create_patient_case_plan(client, headers, name, complaint="Needs crown"):
    r = await client.post("/api/v1/patients/", headers=headers, json={
        "full_name": name, "phone": "9000000101", "gender": "MALE",
    })
    assert r.status_code == 201, f"Create patient failed: {r.text}"
    patient_id = r.json()["id"]
    r = await client.post("/api/v1/cases/", headers=headers, json={
        "patient_id": patient_id, "chief_complaint": complaint,
    })
    assert r.status_code == 201, f"Create case failed: {r.text}"
    case_id = r.json()["id"]
    r = await client.post("/api/v1/treatment-plans/", headers=headers, json={
        "case_id": case_id, "treatment_name": name + " Tx", "cost": 1000, "total_sittings": 2,
    })
    assert r.status_code == 201, f"Create plan failed: {r.text}"
    return r.json()["id"]


@pytest.mark.asyncio
async def test_laboratory_crud_and_rbac(client: AsyncClient, seed):
    ga = await login(client, "lab_ga@t.com")
    ha = await login(client, "lab_ha@t.com")
    dr = await login(client, "lab_dr@t.com")

    # Doctor (VIEW only) cannot create
    r = await client.post("/api/v1/laboratories/", headers=auth(dr),
                          json={"name": "Dr Lab"})
    assert r.status_code == 403, r.text

    # Hospital admin can now create, scoped to their own hospital
    r = await client.post("/api/v1/laboratories/", headers=auth(ha),
                          json={"name": "HA Lab"})
    assert r.status_code == 201, r.text
    ha_lab = r.json()
    assert ha_lab["hospital_id"] == seed["HA_ID"], "HA-created lab must be bound to its hospital"
    ha_lab_id = ha_lab["id"]

    # Group admin creates
    r = await client.post("/api/v1/laboratories/", headers=auth(ga), json={
        "name": "ProLab", "code": "PL-1", "contact_person": "Ravi",
        "phone": "9876501234", "whatsapp_number": "9876501234",
    })
    assert r.status_code == 201, r.text
    lab = r.json()
    lab_id = lab["id"]
    assert lab["name"] == "ProLab"
    assert lab["status"] == "ACTIVE"

    # Duplicate name (case-insensitive) conflicts
    r = await client.post("/api/v1/laboratories/", headers=auth(ga), json={"name": "prolab"})
    assert r.status_code == 409, r.text

    # Hospital B is isolated from Hospital A's laboratory (shares only the legacy global lab)
    hb = await login(client, "lab_hb@t.com")
    r = await client.get("/api/v1/laboratories/", headers=auth(hb))
    assert r.status_code == 200
    assert r.json()["total"] == 1, "Hospital B must see only the shared global laboratory"
    assert r.json()["items"][0]["id"] != ha_lab_id, "Hospital B must not see Hospital A's laboratory"
    r = await client.put(f"/api/v1/laboratories/{ha_lab_id}", headers=auth(hb), json={"name": "Stolen"})
    assert r.status_code == 403, r.text

    # Hospital admin manages own laboratory
    r = await client.put(f"/api/v1/laboratories/{ha_lab_id}", headers=auth(ha), json={"name": "HA Lab Max"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "HA Lab Max"

    # Doctor can list/search (sees own hospital's lab + group admin's global lab)
    r = await client.get("/api/v1/laboratories/", headers=auth(dr))
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 2
    r = await client.get("/api/v1/laboratories/", headers=auth(dr), params={"search": "PRO"})
    assert r.json()["total"] == 1
    r = await client.get("/api/v1/laboratories/", headers=auth(dr), params={"search": "zzz"})
    assert r.json()["total"] == 0

    # Update
    r = await client.put(f"/api/v1/laboratories/{lab_id}", headers=auth(ga),
                         json={"name": "ProLab Max"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "ProLab Max"

    # Delete (doctor forbidden, GA allowed, HA deletes own)
    r = await client.delete(f"/api/v1/laboratories/{lab_id}", headers=auth(dr))
    assert r.status_code == 403, r.text
    r = await client.delete(f"/api/v1/laboratories/{lab_id}", headers=auth(ga))
    assert r.status_code == 200, r.text
    r = await client.get(f"/api/v1/laboratories/{lab_id}", headers=auth(ga))
    assert r.status_code == 404
    r = await client.delete(f"/api/v1/laboratories/{ha_lab_id}", headers=auth(ha))
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_lab_case_auto_create_and_tenant_scope(client: AsyncClient, seed):
    ga = await login(client, "lab_ga@t.com")
    ha = await login(client, "lab_ha@t.com")
    hb = await login(client, "lab_hb@t.com")
    dr = await login(client, "lab_dr@t.com")

    # HA creates patient/case/plan in Hosp A
    plan1 = await create_patient_case_plan(client, auth(ha), "Crown Patient")

    # set-waiting with lab body auto-creates laboratory + lab case
    r = await client.post(f"/api/v1/treatment-plans/{plan1}/set-waiting?waiting_type=WAITING_LAB",
                          headers=auth(dr), json={
                              "lab_name": "DentLab", "lab_order_number": "PO-100",
                              "lab_sent_date": "2026-07-05", "lab_cost": 2000,
                              "lab_tracking_notes": "PFM crown",
                          })
    assert r.status_code == 200, r.text

    r = await client.get(f"/api/v1/lab-cases/by-treatment/{plan1}", headers=auth(dr))
    assert r.status_code == 200, r.text
    lc = r.json()
    assert lc["lab_status"] == "SENT"
    assert lc["order_number"] == "PO-100"
    assert lc["laboratory_name"] == "DentLab"
    assert lc["lab_cost"] == 2000.0
    assert lc["sent_date"] == "2026-07-05"
    assert lc["patient_name"] == "Crown Patient"

    # plan1 is WAITING_LAB so it remains a candidate (with its lab case id),
    # even though a lab case was already auto-created.
    r = await client.get("/api/v1/lab-cases/candidates", headers=auth(dr))
    assert r.status_code == 200, r.text
    plan1_row = next((c for c in r.json() if c["treatment_plan_id"] == plan1), None)
    assert plan1_row is not None, "WAITING_LAB treatment stays a candidate after set-waiting"
    assert plan1_row["lab_case_id"] is not None

    # A WAITING_LAB plan without lab body remains a candidate, then from-treatment creates it
    plan2 = await create_patient_case_plan(client, auth(ha), "Bridge Patient")
    r = await client.post(f"/api/v1/treatment-plans/{plan2}/set-waiting?waiting_type=WAITING_LAB",
                          headers=auth(dr))
    assert r.status_code == 200, r.text
    r = await client.get("/api/v1/lab-cases/candidates", headers=auth(dr))
    assert r.status_code == 200, r.text
    assert any(c["treatment_plan_id"] == plan2 for c in r.json())

    lab_r = await client.post("/api/v1/laboratories/", headers=auth(ga), json={"name": "BridgeLab"})
    assert lab_r.status_code == 201, lab_r.text
    r = await client.post(f"/api/v1/lab-cases/from-treatment/{plan2}", headers=auth(ga),
                          json={"laboratory_id": lab_r.json()["id"], "lab_status": "PENDING"})
    assert r.status_code == 200, r.text
    assert r.json()["laboratory_name"] == "BridgeLab"

    r = await client.get("/api/v1/lab-cases/candidates", headers=auth(dr))
    # A PENDING lab case is not yet sent to the lab, so it stays a candidate
    # (to be sent via WhatsApp batch). It is no longer candidate once SENT.
    plan2_row = next((c for c in r.json() if c["treatment_plan_id"] == plan2), None)
    assert plan2_row is not None, "PENDING lab case must remain a candidate"
    assert plan2_row["lab_case_id"] is not None

    # Listing is tenant-scoped: Hosp A sees 2, Hosp B sees 0, GA sees 2
    r = await client.get("/api/v1/lab-cases/", headers=auth(ha))
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 2
    r = await client.get("/api/v1/lab-cases/", headers=auth(hb))
    assert r.json()["total"] == 0
    r = await client.get("/api/v1/lab-cases/", headers=auth(ga))
    assert r.json()["total"] == 2
    r = await client.get("/api/v1/lab-cases/", headers=auth(dr))
    assert r.json()["total"] == 2

    # search filter
    r = await client.get("/api/v1/lab-cases/", headers=auth(ha), params={"search": "Crown"})
    assert r.json()["total"] == 1


@pytest.mark.asyncio
async def test_lab_case_status_events_whatsapp_call_report(client: AsyncClient, seed):
    ga = await login(client, "lab_ga@t.com")
    ha = await login(client, "lab_ha@t.com")
    dr = await login(client, "lab_dr@t.com")

    plan = await create_patient_case_plan(client, auth(ha), "Report Patient")
    r = await client.post(f"/api/v1/treatment-plans/{plan}/set-waiting?waiting_type=WAITING_LAB",
                          headers=auth(dr), json={
                              "lab_name": "PayLab", "lab_order_number": "PO-200",
                              "lab_sent_date": "2026-07-10", "lab_cost": 1500,
                          })
    assert r.status_code == 200, r.text
    r = await client.get(f"/api/v1/lab-cases/by-treatment/{plan}", headers=auth(dr))
    lab_case_id = r.json()["id"]

    # creation event
    r = await client.get(f"/api/v1/lab-cases/{lab_case_id}/events", headers=auth(dr))
    assert r.status_code == 200, r.text
    assert len(r.json()) == 1
    assert r.json()[0]["event_type"] == "CASE_CREATED"

    # WhatsApp (deep link + mock send)
    r = await client.post(f"/api/v1/lab-cases/{lab_case_id}/whatsapp", headers=auth(dr),
                          json={"message": "PFM crown ready?", "phone": "9876501234"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert "wa.me" in body["deep_link"]
    assert "PFM crown ready" in body["message"]

    # Call log
    r = await client.post(f"/api/v1/lab-cases/{lab_case_id}/call", headers=auth(dr),
                          json={"note": "Discussed crown", "duration_seconds": 120})
    assert r.status_code == 201, r.text
    assert r.json()["event_type"] == "CALL"
    assert "2.0 min" in r.json()["note"]

    r = await client.get(f"/api/v1/lab-cases/{lab_case_id}/events", headers=auth(dr))
    assert len(r.json()) == 3

    # status flow auto-fills dates
    r = await client.post(f"/api/v1/lab-cases/{lab_case_id}/status", headers=auth(dr),
                          json={"status": "IN_PROGRESS", "note": "in oven"})
    assert r.status_code == 200, r.text
    assert r.json()["lab_status"] == "IN_PROGRESS"
    r = await client.post(f"/api/v1/lab-cases/{lab_case_id}/status", headers=auth(dr),
                          json={"status": "RETURNED", "note": "delivered"})
    assert r.status_code == 200, r.text
    assert r.json()["lab_status"] == "RETURNED"
    assert r.json()["returned_date"] == date.today().isoformat()

    r = await client.post(f"/api/v1/lab-cases/{lab_case_id}/status", headers=auth(dr),
                          json={"status": "BOGUS"})
    assert r.status_code == 400

    # events include the two status changes
    r = await client.get(f"/api/v1/lab-cases/{lab_case_id}/events", headers=auth(dr))
    changes = [e for e in r.json() if e["event_type"] == "STATUS_CHANGE"]
    assert len(changes) == 2

    # monthly report json
    r = await client.get("/api/v1/lab-cases/report", headers=auth(dr),
                         params={"month": "2026-07"})
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["month"] == "2026-07"
    assert rep["total_cases"] == 1
    assert rep["total_cost"] == 1500.0
    assert any(row[0] == "PO-200" for row in rep["rows"])
    assert rep["status_breakdown"]["RETURNED"] == 1
    assert rep["lab_breakdown"][0]["laboratory_name"] == "PayLab"
    assert rep["summary"][0]["label"] == "Total Cases"

    # exports
    r = await client.get("/api/v1/lab-cases/report", headers=auth(dr),
                         params={"month": "2026-07", "format": "csv"})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    assert "PO-200" in r.text

    r = await client.get("/api/v1/lab-cases/report", headers=auth(dr),
                         params={"month": "2026-07", "format": "excel"})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats")

    r = await client.get("/api/v1/lab-cases/report", headers=auth(dr),
                         params={"month": "2026-07", "format": "pdf"})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/pdf")

    r = await client.get("/api/v1/lab-cases/report", headers=auth(dr),
                         params={"month": "2026-13"})
    assert r.status_code == 400

    # delete: doctor forbidden, GA allowed
    r = await client.delete(f"/api/v1/lab-cases/{lab_case_id}", headers=auth(dr))
    assert r.status_code == 403, r.text
    r = await client.delete(f"/api/v1/lab-cases/{lab_case_id}", headers=auth(ga))
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_monthly_report_counts_each_lab_case_once_with_multiple_patients(client: AsyncClient, seed):
    """A lab case must appear exactly once in the monthly report even when the
    hospital has several patients. Regression: _report_cases was missing the
    Case/Patient joins, so the tenant filter became a cross join that duplicated
    the lab case once per patient in the hospital."""
    ga = await login(client, "lab_ga@t.com")
    ha = await login(client, "lab_ha@t.com")
    dr = await login(client, "lab_dr@t.com")

    plan = await create_patient_case_plan(client, auth(ha), "Solo Patient")
    r = await client.post(f"/api/v1/treatment-plans/{plan}/set-waiting?waiting_type=WAITING_LAB",
                          headers=auth(dr), json={
                              "lab_name": "OneLab", "lab_order_number": "PO-300",
                              "lab_sent_date": "2026-07-15", "lab_cost": 1200,
                          })
    assert r.status_code == 200, r.text

    # extra patients in the same hospital must not fan out the report
    for name in ("Second Patient", "Third Patient"):
        await create_patient_case_plan(client, auth(ha), name)

    r = await client.get("/api/v1/lab-cases/report", headers=auth(ha),
                         params={"month": "2026-07"})
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["total_cases"] == 1, "single lab case must not be duplicated per patient"
    assert len(rep["rows"]) == 1
    assert rep["rows"][0][0] == "PO-300"
    assert rep["total_cost"] == 1200.0
    assert rep["lab_breakdown"][0]["cases"] == 1

    # group admin sees the same single case
    r = await client.get("/api/v1/lab-cases/report", headers=auth(ga),
                         params={"month": "2026-07"})
    assert r.status_code == 200, r.text
    assert r.json()["total_cases"] == 1
