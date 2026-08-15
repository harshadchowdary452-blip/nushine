"""Medication / Prescription workflow:
- Case Reports accept a structured medications array (single source of truth)
- Treatment Sittings accept the same array
- Full-replace semantics: re-saving the same list never duplicates rows
- Patient → Medications aggregates every case report and every sitting
  chronologically, including events with no medications
"""
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.medication_prescription import MedicationPrescription
from app.models.user import User


@pytest.fixture
async def seed(db_session):
    g1 = AdminGroup(name="Meds Group", description="")
    db_session.add(g1)
    await db_session.flush()
    ha = Hospital(admin_group_id=g1.id, name="Meds Hosp A")
    db_session.add(ha)
    await db_session.flush()

    users = {
        "HA": User(email="meds_ha@t.com", password_hash=hash_password("TestPass123"), full_name="Meds HA",
                   role=Role.HOSPITAL_ADMIN, hospital_id=ha.id, admin_group_id=g1.id,
                   is_active=True, is_verified=True),
        "DR": User(email="meds_dr@t.com", password_hash=hash_password("TestPass123"), full_name="Meds Dr",
                   role=Role.DOCTOR, hospital_id=ha.id, admin_group_id=g1.id,
                   is_active=True, is_verified=True),
    }
    db_session.add_all(list(users.values()))
    await db_session.commit()
    return {"g1": g1.id, "HA_ID": ha.id, **{k: v.id for k, v in users.items()}}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_medication_workflow(client: AsyncClient, seed, db_session):
    ha = await login(client, "meds_ha@t.com")
    dr = await login(client, "meds_dr@t.com")
    h = auth(ha)

    # 1. Create patient.
    r = await client.post("/api/v1/patients/", headers=h, json={
        "full_name": "Meds Patient", "phone": "8200000201", "gender": "FEMALE",
    })
    assert r.status_code == 201, r.text
    patient_id = r.json()["id"]

    # 2. Create case report WITH structured medications.
    r = await client.post("/api/v1/cases/", headers=h, json={
        "patient_id": patient_id,
        "doctor_id": seed["DR"],
        "chief_complaint": "Pain in lower right",
        "medications": [
            {"medication_name": "Amoxicillin", "dosage": "500mg", "frequency": "3 times a day", "duration": "7 days", "instructions": "After food"},
            {"medication_name": "Paracetamol", "dosage": "650mg", "frequency": "twice a day", "duration": "3 days"},
        ],
    })
    assert r.status_code == 201, f"Create case failed: {r.text}"
    case_id = r.json()["id"]
    meds = r.json().get("medications") or []
    assert len(meds) == 2, f"Case must persist 2 medications, got {len(meds)}"

    # 3. Verify audit columns are stamped.
    rows = (await db_session.execute(
        select(MedicationPrescription).where(MedicationPrescription.case_id == case_id))).scalars().all()
    assert len(rows) == 2
    assert all(m.created_by_id == seed["HA"] and m.updated_by_id == seed["HA"] for m in rows)

    # 4. Create treatment plan + first sitting WITH medications.
    r = await client.post("/api/v1/treatment-plans/", headers=h, json={
        "case_id": case_id, "treatment_name": "RCT Meds Tx", "cost": 5000, "total_sittings": 2,
    })
    assert r.status_code == 201, r.text
    plan_id = r.json()["id"]

    r = await client.post("/api/v1/treatment-sittings/", headers=h, json={
        "treatment_plan_id": plan_id,
        "sitting_number": 1,
        "doctor_id": seed["DR"],
        "procedure_performed": "RCT - Access Opening",
        "medications": [
            {"medication_name": "Ibuprofen", "dosage": "400mg", "frequency": "once a day", "duration": "5 days", "instructions": "With milk"},
        ],
    })
    assert r.status_code == 201, f"Create sitting failed: {r.text}"
    sitting_id = r.json()["id"]
    assert len((r.json().get("medications") or [])) == 1

    # 5. Second sitting WITHOUT medications (must still appear in the patient view).
    r = await client.post("/api/v1/treatment-sittings/", headers=h, json={
        "treatment_plan_id": plan_id,
        "sitting_number": 2,
        "doctor_id": seed["DR"],
        "procedure_performed": "RCT - Cleaning",
    })
    assert r.status_code == 201, r.text
    sitting2_id = r.json()["id"]

    # 6. Patient medication aggregation: case report + both sittings present.
    r = await client.get(f"/api/v1/patients/{patient_id}/medications", headers=h)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 3, f"Expected 3 clinical events, got {len(items)}"

    case_event = next(i for i in items if i["event_type"] == "case_report")
    assert len(case_event["medications"]) == 2
    assert case_event["doctor_name"] == "Meds Dr"

    sitting_events = [i for i in items if i["event_type"] == "treatment_sitting"]
    assert len(sitting_events) == 2
    with_meds = next(i for i in sitting_events if i["sitting_number"] == 1)
    assert len(with_meds["medications"]) == 1
    assert with_meds["medications"][0]["medication_name"] == "Ibuprofen"
    no_meds = next(i for i in sitting_events if i["sitting_number"] == 2)
    assert no_meds["medications"] == []

    # Chronological ordering: newest first.
    dates = [i["date"] for i in items]
    assert dates == sorted(dates, reverse=True), f"Events must be newest-first, got {dates}"

    # 7. Idempotency: re-saving the SAME medication list must not duplicate rows.
    r = await client.put(f"/api/v1/cases/{case_id}", headers=h, json={
        "medications": [
            {"medication_name": "Amoxicillin", "dosage": "500mg", "frequency": "3 times a day", "duration": "7 days", "instructions": "After food"},
            {"medication_name": "Paracetamol", "dosage": "650mg", "frequency": "twice a day", "duration": "3 days"},
        ],
    })
    assert r.status_code == 200, r.text
    rows = (await db_session.execute(
        select(MedicationPrescription).where(MedicationPrescription.case_id == case_id))).scalars().all()
    assert len(rows) == 2, f"Re-save must not duplicate; got {len(rows)} rows"

    # 8. Editing replaces the full list (removed one, changed one).
    r = await client.put(f"/api/v1/cases/{case_id}", headers=h, json={
        "medications": [
            {"medication_name": "Metronidazole", "dosage": "400mg", "frequency": "3 times a day", "duration": "5 days"},
        ],
    })
    assert r.status_code == 200, r.text
    rows = (await db_session.execute(
        select(MedicationPrescription).where(MedicationPrescription.case_id == case_id))).scalars().all()
    assert len(rows) == 1
    assert rows[0].medication_name == "Metronidazole"

    # 9. Clearing the list entirely removes case-level medications.
    r = await client.put(f"/api/v1/cases/{case_id}", headers=h, json={"medications": []})
    assert r.status_code == 200, r.text
    rows = (await db_session.execute(
        select(MedicationPrescription).where(MedicationPrescription.case_id == case_id))).scalars().all()
    assert len(rows) == 0

    # 10. Sitting medications survive independent of case-level edits.
    rows = (await db_session.execute(
        select(MedicationPrescription).where(MedicationPrescription.treatment_sitting_id == sitting_id))).scalars().all()
    assert len(rows) == 1
    assert rows[0].medication_name == "Ibuprofen"

    # 11. Sitting medications are full-replace too.
    r = await client.put(f"/api/v1/treatment-sittings/{sitting_id}", headers=h, json={
        "medications": [
            {"medication_name": "Amoxicillin", "dosage": "500mg", "frequency": "twice a day", "duration": "7 days"},
            {"medication_name": "Ibuprofen", "dosage": "400mg", "frequency": "once a day", "duration": "5 days"},
        ],
    })
    assert r.status_code == 200, r.text
    assert len((r.json().get("medications") or [])) == 2
    rows = (await db_session.execute(
        select(MedicationPrescription).where(MedicationPrescription.treatment_sitting_id == sitting_id))).scalars().all()
    assert len(rows) == 2, "Sitting medication re-save must not duplicate"


@pytest.mark.asyncio
async def test_medication_requires_name(client: AsyncClient, seed):
    ha = await login(client, "meds_ha@t.com")
    h = auth(ha)
    r = await client.post("/api/v1/patients/", headers=h, json={
        "full_name": "Meds Patient 2", "phone": "8200000202", "gender": "MALE",
    })
    patient_id = r.json()["id"]
    r = await client.post("/api/v1/cases/", headers=h, json={
        "patient_id": patient_id,
        "chief_complaint": "Missing medication name",
        "medications": [{"dosage": "500mg"}],
    })
    assert r.status_code == 422, r.text
