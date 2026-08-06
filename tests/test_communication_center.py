"""Phase 3B tests: Communication Center — unified aggregation across
communication_logs / lead_communications / consent_forms / notifications,
tenant scoping, filters, preview/smart-template validation, resend + audit,
download, export (csv/excel/pdf), stats, activities, patient timeline."""
import os
import tempfile

import pytest
from httpx import AsyncClient

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User
from app.models.patient import Patient
from app.models.communication_log import CommunicationLog
from app.models.lead import Lead, LeadCommunication
from app.models.consent_form import ConsentForm
from app.models.notification import Notification


@pytest.fixture
async def seed(db_session):
    g1 = AdminGroup(name="Comm Test Group", description="")
    db_session.add(g1)
    await db_session.flush()
    ha = Hospital(admin_group_id=g1.id, name="Comm Hosp A")
    hb = Hospital(admin_group_id=g1.id, name="Comm Hosp B")
    db_session.add_all([ha, hb])
    await db_session.flush()

    def _user(email, name, role, hospital=None, group=None):
        return User(email=email, password_hash=hash_password("TestPass123"), full_name=name,
                    role=role, hospital_id=hospital.id if hospital else None,
                    admin_group_id=group.id if group else None,
                    is_active=True, is_verified=True)

    users = {
        "SA": _user("cc_sa@t.com", "Comm SA", Role.SUPER_ADMIN),
        "GA": _user("cc_ga@t.com", "Comm GA", Role.GROUP_ADMIN, group=g1),
        "HA": _user("cc_ha@t.com", "Comm HA", Role.HOSPITAL_ADMIN, hospital=ha, group=g1),
        "HB": _user("cc_hb@t.com", "Comm HB", Role.HOSPITAL_ADMIN, hospital=hb, group=g1),
        "DR": _user("cc_dr@t.com", "Comm Dr", Role.DOCTOR, hospital=ha, group=g1),
    }
    db_session.add_all(list(users.values()))
    await db_session.flush()

    patient = Patient(hospital_id=ha.id, full_name="Alice Test", phone="9000000001",
                      gender="FEMALE", op_no="OP-1001")
    db_session.add(patient)
    await db_session.flush()

    lead = Lead(hospital_id=ha.id, lead_name="Bob Lead", mobile="9000000002")
    db_session.add(lead)
    await db_session.flush()

    log = CommunicationLog(
        patient_id=patient.id, hospital_id=ha.id,
        channel="WHATSAPP", message_type="GENERAL", subject="Welcome",
        message="Hi Alice, welcome to the clinic.", status="SENT", sent_at=None,
    )
    db_session.add(log)
    await db_session.flush()

    log_unresolved = CommunicationLog(
        patient_id=patient.id, hospital_id=ha.id,
        channel="WHATSAPP", message_type="GENERAL", subject="Bad Template",
        message="Hi {{patient_name}}, your token is {{bogus_token}}.", status="SENT",
    )
    db_session.add(log_unresolved)
    await db_session.flush()

    consent = ConsentForm(
        patient_id=patient.id, patient_name="Alice Test", op_number="OP-1001",
        phone="9000000001", doctor_id=None, consent_type="TREATMENT_CONSENT",
        remarks="Signed on paper", pdf_path="",
        hospital_id=ha.id, uploaded_by=users["HA"].id,
    )
    db_session.add(consent)
    await db_session.flush()

    lc = LeadCommunication(
        lead_id=lead.id, hospital_id=ha.id, sent_by=users["HA"].id, sent_by_name="Comm HA",
        channel="WHATSAPP", message_type="FOLLOW_UP", message="Hi Bob, follow up?",
        status="SENT", delivery_status="DELIVERED",
    )
    db_session.add(lc)
    await db_session.flush()

    note = Notification(
        user_id=users["HA"].id, hospital_id=ha.id, type="TREATMENT_OVERDUE",
        title="Treatment overdue", description="Alice's treatment is overdue.",
    )
    db_session.add(note)
    await db_session.flush()

    await db_session.commit()

    return {
        "g1": g1.id, "HA_ID": ha.id, "HB_ID": hb.id,
        "patient_id": patient.id, "lead_id": lead.id,
        "log_id": log.id, "log_unresolved_id": log_unresolved.id,
        "consent_id": consent.id, "lead_comm_id": lc.id, "notification_id": note.id,
        **{k: v.id for k, v in users.items()},
    }


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_cc_list_aggregation_and_rbac(client: AsyncClient, seed):
    ga = await login(client, "cc_ga@t.com")
    ha = await login(client, "cc_ha@t.com")
    hb = await login(client, "cc_hb@t.com")
    sa = await login(client, "cc_sa@t.com")
    dr = await login(client, "cc_dr@t.com")

    # Doctor has no VIEW_COMMUNICATIONS
    r = await client.get("/api/v1/communication-center/communications", headers=auth(dr))
    assert r.status_code == 403, r.text

    # HA sees everything in hospital A (log, unresolved log, consent, lead comm, notification)
    r = await client.get("/api/v1/communication-center/communications", headers=auth(ha))
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 5

    # HB sees nothing in hospital B
    r = await client.get("/api/v1/communication-center/communications", headers=auth(hb))
    assert r.json()["total"] == 0

    # GA and SA see the whole group
    r = await client.get("/api/v1/communication-center/communications", headers=auth(ga))
    assert r.json()["total"] == 5
    r = await client.get("/api/v1/communication-center/communications", headers=auth(sa))
    assert r.json()["total"] == 5

    # Aggregated sources present
    r = await client.get("/api/v1/communication-center/communications", headers=auth(ha))
    sources = {i["source_module"] for i in r.json()["items"]}
    assert "WhatsApp" in sources and "Consent Forms" in sources
    assert "Leads" in sources and "Notifications" in sources

    # search by patient name and phone
    r = await client.get("/api/v1/communication-center/communications", headers=auth(ha),
                         params={"search": "alice"})
    assert r.json()["total"] == 4  # 2 logs + consent + notification body
    r = await client.get("/api/v1/communication-center/communications", headers=auth(ha),
                         params={"search": "9000000002"})
    assert r.json()["total"] == 1  # lead comm phone

    # filters
    r = await client.get("/api/v1/communication-center/communications", headers=auth(ha),
                         params={"channel": "WHATSAPP"})
    assert r.json()["total"] == 3  # 2 logs + lead comm
    r = await client.get("/api/v1/communication-center/communications", headers=auth(ha),
                         params={"status": "SENT"})
    assert r.json()["total"] == 3  # 2 logs + notification
    r = await client.get("/api/v1/communication-center/communications", headers=auth(ha),
                         params={"source_module": "Consent Forms"})
    assert r.json()["total"] == 1
    r = await client.get("/api/v1/communication-center/communications", headers=auth(ha),
                         params={"channel": "BOGUS"})
    assert r.status_code == 400

    # hospital filter scoped for GA; HB blocked from asking for A
    r = await client.get("/api/v1/communication-center/communications", headers=auth(ga),
                         params={"hospital_id": seed["HA_ID"]})
    assert r.status_code == 200 and r.json()["total"] == 5
    r = await client.get("/api/v1/communication-center/communications", headers=auth(hb),
                         params={"hospital_id": seed["HA_ID"]})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_cc_detail_preview_resend(client: AsyncClient, seed):
    ga = await login(client, "cc_ga@t.com")
    ha = await login(client, "cc_ha@t.com")
    hb = await login(client, "cc_hb@t.com")

    # detail with audit
    r = await client.get(f"/api/v1/communication-center/communications/WhatsApp/{seed['log_id']}",
                         headers=auth(ha))
    assert r.status_code == 200, r.text
    item = r.json()
    assert item["patient_name"] == "Alice Test"
    assert item["source_module"] == "WhatsApp"
    assert item["can_resend"] is True

    # cross-tenant detail denied
    r = await client.get(f"/api/v1/communication-center/communications/WhatsApp/{seed['log_id']}",
                         headers=auth(hb))
    assert r.status_code == 403

    # preview: resolved message can be sent
    r = await client.get(f"/api/v1/communication-center/communications/WhatsApp/{seed['log_id']}/preview",
                         headers=auth(ha))
    assert r.status_code == 200, r.text
    assert r.json()["can_send"] is True
    assert r.json()["recipient"] == "9000000001"

    # preview: unresolved variable flagged
    r = await client.get(
        f"/api/v1/communication-center/communications/WhatsApp/{seed['log_unresolved_id']}/preview",
        headers=auth(ha))
    assert r.status_code == 200, r.text
    assert r.json()["can_send"] is False
    assert any("bogus_token" in v for v in r.json()["missing_variables"])

    # resend of unresolved -> 422 with the exact variable
    r = await client.post(
        f"/api/v1/communication-center/communications/WhatsApp/{seed['log_unresolved_id']}/resend",
        headers=auth(ha))
    assert r.status_code == 422, r.text
    assert "bogus_token" in r.text

    # resend happy path creates a new CommunicationLog + audit + activity
    r = await client.post(
        f"/api/v1/communication-center/communications/WhatsApp/{seed['log_id']}/resend",
        headers=auth(ha))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "SENT"
    assert "wa.me" in (body["deep_link"] or "")

    # original now has a RESEND activity in its audit trail
    r = await client.get(f"/api/v1/communication-center/communications/WhatsApp/{seed['log_id']}",
                         headers=auth(ha))
    actions = [a["action"] for a in r.json()["audit"]]
    assert "RESEND" in actions

    # new record exists and is visible
    r = await client.get("/api/v1/communication-center/communications", headers=auth(ha))
    assert r.json()["total"] == 6

    # consent forms cannot be resent
    r = await client.post(
        f"/api/v1/communication-center/communications/Consent Forms/{seed['consent_id']}/resend",
        headers=auth(ha))
    assert r.status_code == 400

    # SA is read-only: no MANAGE_COMMUNICATIONS
    sa = await login(client, "cc_sa@t.com")
    r = await client.post(
        f"/api/v1/communication-center/communications/WhatsApp/{seed['log_id']}/resend",
        headers=auth(sa))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_cc_export_download_and_activities(client: AsyncClient, seed, db_session):
    ga = await login(client, "cc_ga@t.com")
    ha = await login(client, "cc_ha@t.com")

    # HA cannot export (EXPORT_COMMUNICATIONS is GA/SA only)
    r = await client.post("/api/v1/communication-center/export",
                          headers=auth(ha), json={"format": "csv"})
    assert r.status_code == 403

    # GA csv export
    r = await client.post("/api/v1/communication-center/export",
                          headers=auth(ga), json={"format": "csv"})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    assert "Alice Test" in r.text

    # GA excel export
    r = await client.post("/api/v1/communication-center/export",
                          headers=auth(ga), json={"format": "excel"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats")

    # SA pdf export
    sa = await login(client, "cc_sa@t.com")
    r = await client.post("/api/v1/communication-center/export",
                          headers=auth(sa), json={"format": "pdf"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")

    # GA zip export (empty artifact set is fine)
    r = await client.post("/api/v1/communication-center/export",
                          headers=auth(ga), json={"format": "zip"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"

    # download consent form PDF
    fd, pdf = tempfile.mkstemp(suffix=".pdf")
    os.write(fd, b"%PDF-1.4 test")
    os.close(fd)
    from app.models.consent_form import ConsentForm
    cf = await db_session.get(ConsentForm, seed["consent_id"])
    cf.pdf_path = pdf
    await db_session.commit()

    r = await client.get(f"/api/v1/communication-center/communications/Consent Forms/{seed['consent_id']}/download",
                         headers=auth(ha))
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"

    # activities: EXPORT (from GA) + DOWNLOAD (from HA) recorded
    r = await client.get("/api/v1/communication-center/activities", headers=auth(ga))
    assert r.status_code == 200, r.text
    actions = {a["action"] for a in r.json()["items"]}
    assert "EXPORT" in actions
    assert "DOWNLOAD" in actions
    r = await client.get("/api/v1/communication-center/activities", headers=auth(ga),
                         params={"action": "DOWNLOAD"})
    assert r.json()["total"] == 1

    os.remove(pdf)


@pytest.mark.asyncio
async def test_cc_stats_timeline(client: AsyncClient, seed):
    ha = await login(client, "cc_ha@t.com")
    ga = await login(client, "cc_ga@t.com")

    r = await client.get("/api/v1/communication-center/communications/stats", headers=auth(ha))
    assert r.status_code == 200, r.text
    stats = r.json()
    assert stats["total"] == 5
    assert stats["by_channel"].get("WHATSAPP") == 3
    assert stats["by_channel"].get("PRINTED_DOCUMENT") == 1
    assert stats["by_channel"].get("MANUAL") == 1
    assert stats["by_source_module"].get("Consent Forms") == 1
    assert stats["by_hospital"].get("Comm Hosp A") == 5

    # patient timeline aggregates without duplicates
    r = await client.get(f"/api/v1/communication-center/patients/{seed['patient_id']}/communications",
                         headers=auth(ga))
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) == 3  # 2 logs + consent
    assert len({(i["source_module"], i["source_id"]) for i in items}) == 3
    times = [i["created_at"] for i in items]
    assert times == sorted(times)
