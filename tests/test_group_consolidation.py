"""Phase 2C-1B tests: group admin consolidation — catalogue hierarchy in the
consolidated matrix, the validation engine, one-click generate, per-hospital
submission overview (submitted by / last updated / remarks / status counts),
duplicate prevention and the audit trail."""
import pytest
from httpx import AsyncClient

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User
from app.models.monthly_order import MonthlyOrderItem


@pytest.fixture
async def seed(db_session):
    g1 = AdminGroup(name="Consolidation Group", description="")
    db_session.add(g1)
    await db_session.flush()
    ha = Hospital(admin_group_id=g1.id, name="Consolidate Hosp A")
    hb = Hospital(admin_group_id=g1.id, name="Consolidate Hosp B")
    hc = Hospital(admin_group_id=g1.id, name="Consolidate Hosp C")
    db_session.add_all([ha, hb, hc])
    await db_session.flush()

    def _user(email, name, role, hospital=None, group=None):
        return User(email=email, password_hash=hash_password("TestPass123"), full_name=name,
                    role=role, hospital_id=hospital.id if hospital else None,
                    admin_group_id=group.id if group else None,
                    is_active=True, is_verified=True)

    users = {
        "SA": _user("gc_sa@t.com", "SA", Role.SUPER_ADMIN),
        "GA": _user("gc_ga@t.com", "GA", Role.GROUP_ADMIN, group=g1),
        "HA": _user("gc_ha@t.com", "Hosp A Admin", Role.HOSPITAL_ADMIN, hospital=ha, group=g1),
        "HB": _user("gc_hb@t.com", "Hosp B Admin", Role.HOSPITAL_ADMIN, hospital=hb, group=g1),
        "HC": _user("gc_hc@t.com", "Hosp C Admin", Role.HOSPITAL_ADMIN, hospital=hc, group=g1),
    }
    db_session.add_all(list(users.values()))
    await db_session.commit()
    return {"g1": g1.id, "HA_ID": ha.id, "HB_ID": hb.id, "HC_ID": hc.id,
            **{k: v.id for k, v in users.items()}}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def seed_category(client, token, name, parent_id=None):
    body = {"name": name}
    if parent_id:
        body["parent_id"] = parent_id
    r = await client.post("/api/v1/inventory/categories/", headers=auth(token), json=body)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def seed_item(client, token, name, code, **extra):
    r = await client.post("/api/v1/inventory/items/", headers=auth(token),
                          json={"name": name, "code": code, **extra})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def seed_stock(client, token, hospital_id, item_id, quantity, **extra):
    r = await client.post("/api/v1/inventory/hospital/", headers=auth(token),
                          json={"hospital_id": hospital_id, "item_id": item_id, "quantity": quantity, **extra})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def submit_indent(client, token, hospital_id, order_period, lines):
    return await client.post("/api/v1/inventory/monthly-orders/submit", headers=auth(token),
                             json={"hospital_id": hospital_id, "order_period": order_period,
                                   "items": lines})


async def seed_endodontics_hierarchy(client, token):
    """ENDODONTICS -> Hand Files -> two items; ENDODONTICS -> Rotary -> one item."""
    cat_id = await seed_category(client, token, "ENDODONTICS")
    hand_files = await seed_category(client, token, "Hand Files", parent_id=cat_id)
    rotary = await seed_category(client, token, "Rotary", parent_id=cat_id)
    k21 = await seed_item(client, token, "21mm K Files", "K-21",
                          category_id=cat_id, sub_category_id=hand_files,
                          purchase_price=40, average_cost=40, unit="BOX")
    k25 = await seed_item(client, token, "25mm K Files", "K-25",
                          category_id=cat_id, sub_category_id=hand_files,
                          purchase_price=45, average_cost=45, unit="BOX")
    r17 = await seed_item(client, token, "17/04 Rotary", "R-17",
                          category_id=cat_id, sub_category_id=rotary,
                          purchase_price=80, average_cost=80, unit="BOX")
    return {"cat": cat_id, "hand_files": hand_files, "rotary": rotary,
            "k21": k21, "k25": k25, "r17": r17}


@pytest.mark.asyncio
async def test_consolidated_includes_catalogue_hierarchy(client: AsyncClient, seed):
    sa = await login(client, "gc_sa@t.com")
    ha = await login(client, "gc_ha@t.com")
    hb = await login(client, "gc_hb@t.com")
    ga = await login(client, "gc_ga@t.com")

    ids = await seed_endodontics_hierarchy(client, sa)
    await seed_stock(client, sa, seed["HA_ID"], ids["k21"], 10, minimum_stock=4)
    await seed_stock(client, sa, seed["HA_ID"], ids["k25"], 5, minimum_stock=4)
    await seed_stock(client, sa, seed["HB_ID"], ids["k21"], 20, minimum_stock=4)
    await seed_stock(client, sa, seed["HB_ID"], ids["r17"], 3, minimum_stock=2)

    await submit_indent(client, ha, seed["HA_ID"], "2026-08", [
        {"item_id": ids["k21"], "required_quantity": 8, "estimated_cost": 320},
        {"item_id": ids["k25"], "required_quantity": 4, "estimated_cost": 180},
    ])
    await submit_indent(client, hb, seed["HB_ID"], "2026-08", [
        {"item_id": ids["k21"], "required_quantity": 6, "estimated_cost": 240},
        {"item_id": ids["r17"], "required_quantity": 10, "estimated_cost": 800},
    ])

    r = await client.get("/api/v1/inventory/monthly-orders/consolidated", headers=auth(ga),
                         params={"order_period": "2026-08"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["grand_total_quantity"] == 8 + 4 + 6 + 10
    assert body["grand_total_cost"] == 320 + 180 + 240 + 800

    by_name = {it["item_name"]: it for it in body["items"]}
    assert by_name["21mm K Files"]["category_name"] == "ENDODONTICS"
    assert by_name["21mm K Files"]["sub_category_name"] == "Hand Files"
    assert by_name["17/04 Rotary"]["sub_category_name"] == "Rotary"

    k21 = by_name["21mm K Files"]
    assert k21["hospitals"][seed["HA_ID"]]["required_quantity"] == 8
    assert k21["hospitals"][seed["HB_ID"]]["required_quantity"] == 6
    assert k21["hospitals"][seed["HA_ID"]]["status"] == "SUBMITTED"

    # Category -> Sub Category -> Item ordering is preserved
    names = [it["item_name"] for it in body["items"]]
    assert names == ["21mm K Files", "25mm K Files", "17/04 Rotary"]

    # Every hospital in the group appears (even without an order)
    assert len(body["hospitals"]) == 3


@pytest.mark.asyncio
async def test_validation_detects_missing_submissions(client: AsyncClient, seed):
    sa = await login(client, "gc_sa@t.com")
    ha = await login(client, "gc_ha@t.com")
    ga = await login(client, "gc_ga@t.com")
    item_id = await seed_item(client, sa, "Gauze", "GC-GZ-1", purchase_price=10)

    await submit_indent(client, ha, seed["HA_ID"], "2026-08", [
        {"item_id": item_id, "required_quantity": 5, "estimated_cost": 50},
    ])

    r = await client.get("/api/v1/inventory/monthly-orders/validate", headers=auth(ga),
                         params={"order_period": "2026-08"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_valid"] is False
    assert body["hospitals_checked"] == 3
    assert body["hospitals_submitted"] == 1
    codes = {e["code"] for e in body["errors"]}
    assert "MISSING_SUBMISSION" in codes
    missing = next(e for e in body["errors"] if e["code"] == "MISSING_SUBMISSION")
    assert missing["hospital_name"] == "Consolidate Hosp B"


@pytest.mark.asyncio
async def test_validation_detects_draft_not_submitted(client: AsyncClient, seed):
    sa = await login(client, "gc_sa@t.com")
    ha = await login(client, "gc_ha@t.com")
    ga = await login(client, "gc_ga@t.com")
    item_id = await seed_item(client, sa, "Gloves", "GC-GLV-1", purchase_price=10)

    # Create a DRAFT but never submit it
    r = await client.post("/api/v1/inventory/monthly-orders/", headers=auth(ha),
                          json={"hospital_id": seed["HA_ID"], "order_period": "2026-08"})
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "DRAFT"

    r = await client.get("/api/v1/inventory/monthly-orders/validate", headers=auth(ga),
                         params={"order_period": "2026-08"})
    assert r.status_code == 200
    body = r.json()
    assert body["is_valid"] is False
    codes = {e["code"] for e in body["errors"]}
    assert "NOT_SUBMITTED" in codes


@pytest.mark.asyncio
async def test_validation_detects_negative_quantity(client: AsyncClient, seed, db_session):
    sa = await login(client, "gc_sa@t.com")
    ha = await login(client, "gc_ha@t.com")
    ga = await login(client, "gc_ga@t.com")
    item_id = await seed_item(client, sa, "Suture", "GC-SUT-1", purchase_price=50)

    await submit_indent(client, ha, seed["HA_ID"], "2026-08", [
        {"item_id": item_id, "required_quantity": 3, "estimated_cost": 150},
    ])

    # Corrupt the line directly so the validation engine is the safety net
    row = (await db_session.execute(
        MonthlyOrderItem.__table__.select().where(MonthlyOrderItem.__table__.c.item_id == item_id)
    )).first()
    assert row is not None
    await db_session.execute(
        MonthlyOrderItem.__table__.update().where(MonthlyOrderItem.__table__.c.id == row[0])
        .values(required_quantity=-2)
    )
    await db_session.commit()

    r = await client.get("/api/v1/inventory/monthly-orders/validate", headers=auth(ga),
                         params={"order_period": "2026-08"})
    assert r.status_code == 200
    body = r.json()
    assert body["is_valid"] is False
    codes = {e["code"] for e in body["errors"]}
    assert "NEGATIVE_QUANTITY" in codes


@pytest.mark.asyncio
async def test_generate_blocks_when_invalid_and_returns_matrix_when_valid(client: AsyncClient, seed):
    sa = await login(client, "gc_sa@t.com")
    ha = await login(client, "gc_ha@t.com")
    hb = await login(client, "gc_hb@t.com")
    hc = await login(client, "gc_hc@t.com")
    ga = await login(client, "gc_ga@t.com")

    item_id = await seed_item(client, sa, "Composite", "GC-COMP-1", purchase_price=100)
    await seed_stock(client, sa, seed["HA_ID"], item_id, 5)
    await seed_stock(client, sa, seed["HB_ID"], item_id, 6)

    # Only two of three hospitals submitted -> generate must refuse
    await submit_indent(client, ha, seed["HA_ID"], "2026-08", [
        {"item_id": item_id, "required_quantity": 10, "estimated_cost": 1000},
    ])
    await submit_indent(client, hb, seed["HB_ID"], "2026-08", [
        {"item_id": item_id, "required_quantity": 4, "estimated_cost": 400},
    ])
    r = await client.post("/api/v1/inventory/monthly-orders/generate", headers=auth(ga),
                          params={"order_period": "2026-08"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["validated"] is False
    assert body["consolidated"] is None
    assert any(e["code"] == "MISSING_SUBMISSION" for e in body["validation"]["errors"])

    # Third hospital submits -> valid -> consolidated matrix returned
    await submit_indent(client, hc, seed["HC_ID"], "2026-08", [
        {"item_id": item_id, "required_quantity": 2, "estimated_cost": 200},
    ])
    r = await client.post("/api/v1/inventory/monthly-orders/generate", headers=auth(ga),
                          params={"order_period": "2026-08"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["validated"] is True
    assert body["consolidated"]["grand_total_quantity"] == 16
    assert body["consolidated"]["grand_total_cost"] == 1600
    item = body["consolidated"]["items"][0]
    assert item["hospitals"][seed["HA_ID"]]["required_quantity"] == 10
    assert item["hospitals"][seed["HC_ID"]]["required_quantity"] == 2


@pytest.mark.asyncio
async def test_duplicate_submit_is_impossible(client: AsyncClient, seed):
    sa = await login(client, "gc_sa@t.com")
    ha = await login(client, "gc_ha@t.com")
    item_id = await seed_item(client, sa, "Mask", "GC-MSK-1", purchase_price=5)

    first = await submit_indent(client, ha, seed["HA_ID"], "2026-09", [
        {"item_id": item_id, "required_quantity": 5, "estimated_cost": 25},
    ])
    assert first.status_code == 200, first.text

    # Submitting again must not create a second order — 409 instead
    second = await submit_indent(client, ha, seed["HA_ID"], "2026-09", [
        {"item_id": item_id, "required_quantity": 7, "estimated_cost": 35},
    ])
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_overview_includes_submitted_by_last_updated_remarks(client: AsyncClient, seed):
    sa = await login(client, "gc_sa@t.com")
    ha = await login(client, "gc_ha@t.com")
    ga = await login(client, "gc_ga@t.com")
    item_id = await seed_item(client, sa, "Bonding", "GC-BND-1", purchase_price=200)

    r = await client.post("/api/v1/inventory/monthly-orders/submit", headers=auth(ha), json={
        "hospital_id": seed["HA_ID"], "order_period": "2026-10", "notes": "urgent restock",
        "items": [{"item_id": item_id, "required_quantity": 3, "estimated_cost": 600}],
    })
    assert r.status_code == 200, r.text

    r = await client.get("/api/v1/inventory/monthly-orders/overview", headers=auth(ga),
                         params={"order_period": "2026-10"})
    assert r.status_code == 200, r.text
    body = r.json()
    a_row = next(h for h in body["hospitals"] if h["hospital_id"] == seed["HA_ID"])
    assert a_row["submitted_by_name"] == "Hosp A Admin"
    assert a_row["submitted_by"] == seed["HA"]
    assert a_row["remarks"] == "urgent restock"
    assert a_row["last_updated"] is not None
    assert body["status_counts"]["SUBMITTED"] == 1
    assert body["orders_submitted"] == 1

    # submitted_by is also exposed on the order response itself
    r = await client.get(f"/api/v1/inventory/monthly-orders/{a_row['order_id']}", headers=auth(ga))
    assert r.status_code == 200, r.text
    assert r.json()["submitted_by"] == seed["HA"]


@pytest.mark.asyncio
async def test_audit_history_tracks_workflow_and_scopes(client: AsyncClient, seed):
    sa = await login(client, "gc_sa@t.com")
    ha = await login(client, "gc_ha@t.com")
    ga = await login(client, "gc_ga@t.com")
    hb = await login(client, "gc_hb@t.com")
    item_id = await seed_item(client, sa, "Anesth", "GC-ANE-1", purchase_price=30)

    r = await client.post("/api/v1/inventory/monthly-orders/submit", headers=auth(ha), json={
        "hospital_id": seed["HA_ID"], "order_period": "2026-11",
        "items": [{"item_id": item_id, "required_quantity": 2, "estimated_cost": 60}],
    })
    oid = r.json()["id"]
    await client.post(f"/api/v1/inventory/monthly-orders/{oid}/transition", headers=auth(ga),
                      json={"to_status": "REVIEWED"})

    # Other hospital creates its own pending item (should not leak into A's audit)
    await client.post("/api/v1/inventory/pending-items/", headers=auth(hb),
                      json={"item_name": "Hosp B Custom", "estimated_cost": 10})

    r = await client.get("/api/v1/inventory/monthly-orders/audit", headers=auth(ga),
                         params={"page_size": 50})
    assert r.status_code == 200, r.text
    body = r.json()
    actions = {e["action"] for e in body["items"]}
    assert "TRANSITION_MONTHLY_ORDER" in actions
    reviewed = next(e for e in body["items"] if e["action"] == "TRANSITION_MONTHLY_ORDER"
                    and "-> SUBMITTED" in (e["details"] or ""))
    assert reviewed["user_name"] == "Hosp A Admin"
    assert reviewed["hospital_name"] == "Consolidate Hosp A"

    # Hospital B's audit is scoped to its own hospital only
    r = await client.get("/api/v1/inventory/monthly-orders/audit", headers=auth(hb))
    assert r.status_code == 200
    entries = r.json()["items"]
    assert all(e["hospital_id"] == seed["HB_ID"] for e in entries)
    assert any(e["action"] == "CREATE_PENDING_ITEM" for e in entries)


@pytest.mark.asyncio
async def test_audit_tracks_other_item_approval_and_rejection(client: AsyncClient, seed):
    ha = await login(client, "gc_ha@t.com")
    ga = await login(client, "gc_ga@t.com")

    r = await client.post("/api/v1/inventory/pending-items/", headers=auth(ha),
                          json={"item_name": "Approved Paste", "estimated_cost": 120})
    pid = r.json()["id"]
    await client.post(f"/api/v1/inventory/pending-items/{pid}/review", headers=auth(ga),
                      json={"action": "APPROVE"})

    r = await client.get("/api/v1/inventory/monthly-orders/audit", headers=auth(ga))
    assert r.status_code == 200
    entries = r.json()["items"]
    assert any(e["action"] == "CREATE_PENDING_ITEM" for e in entries)
    assert any(e["action"] == "REVIEW_PENDING_ITEM" for e in entries)
    approved = next(e for e in entries if e["action"] == "REVIEW_PENDING_ITEM")
    assert approved["user_name"] == "GA"
    assert "APPROVED" in (approved["details"] or "")


@pytest.mark.asyncio
async def test_consolidated_export_is_item_hospital_matrix(client: AsyncClient, seed):
    sa = await login(client, "gc_sa@t.com")
    ha = await login(client, "gc_ha@t.com")
    hb = await login(client, "gc_hb@t.com")
    ga = await login(client, "gc_ga@t.com")

    k21 = await seed_item(client, sa, "21mm K Files", "K-21", unit="BOX")
    k25 = await seed_item(client, sa, "25mm K Files", "K-25", unit="BOX")
    await seed_stock(client, sa, seed["HA_ID"], k21, 10)
    await seed_stock(client, sa, seed["HB_ID"], k21, 20)
    await seed_stock(client, sa, seed["HA_ID"], k25, 5)

    await submit_indent(client, ha, seed["HA_ID"], "2026-08", [
        {"item_id": k21, "required_quantity": 8, "estimated_cost": 320},
        {"item_id": k25, "required_quantity": 4, "estimated_cost": 180},
    ])
    await submit_indent(client, hb, seed["HB_ID"], "2026-08", [
        {"item_id": k21, "required_quantity": 6, "estimated_cost": 240},
    ])

    r = await client.get("/api/v1/reports/inventory", headers=auth(ga),
                         params={"report_type": "consolidated", "format": "json",
                                 "order_period": "2026-08"})
    assert r.status_code == 200, r.text
    body = r.json()
    headers = body["headers"]

    assert headers[0] == "Period"
    assert headers[1] == "Item"
    assert headers[2] == "Unit"
    assert "Consolidate Hosp A" in headers
    assert "Consolidate Hosp B" in headers
    assert "Total Required" in headers
    assert "Est. Cost" in headers
    # Removed columns
    assert "Code" not in headers
    assert "Brand" not in headers
    assert "Hospital" not in headers
    assert "Current Stock" not in headers

    by_name = {row[1]: row for row in body["rows"]}
    assert set(by_name) == {"21mm K Files", "25mm K Files"}  # each item once

    ha_idx = headers.index("Consolidate Hosp A")
    hb_idx = headers.index("Consolidate Hosp B")
    total_idx = headers.index("Total Required")
    cost_idx = headers.index("Est. Cost")

    k21_row = by_name["21mm K Files"]
    assert k21_row[ha_idx] == 8
    assert k21_row[hb_idx] == 6
    assert k21_row[total_idx] == 14
    assert k21_row[cost_idx] == 560

    k25_row = by_name["25mm K Files"]
    assert k25_row[ha_idx] == 4
    assert k25_row[hb_idx] == 0
    assert k25_row[total_idx] == 4
    assert k25_row[cost_idx] == 180
