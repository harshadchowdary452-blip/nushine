"""Tests for the monthly order module: suggestions, lifecycle, consolidation,
insights/transfer suggestions, inventory reports, and transaction immutability."""
import pytest
from httpx import AsyncClient

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User


@pytest.fixture
async def seed(db_session):
    g1 = AdminGroup(name="Order Group", description="")
    db_session.add(g1)
    await db_session.flush()
    ha = Hospital(admin_group_id=g1.id, name="Order Hosp A")
    hb = Hospital(admin_group_id=g1.id, name="Order Hosp B")
    db_session.add_all([ha, hb])
    await db_session.flush()

    def _user(email, name, role, hospital=None, group=None):
        return User(email=email, password_hash=hash_password("TestPass123"), full_name=name,
                    role=role, hospital_id=hospital.id if hospital else None,
                    admin_group_id=group.id if group else None,
                    is_active=True, is_verified=True)

    users = {
        "SA": _user("ord_sa@t.com", "SA", Role.SUPER_ADMIN),
        "GA": _user("ord_ga@t.com", "GA", Role.GROUP_ADMIN, group=g1),
        "HA": _user("ord_ha@t.com", "HA", Role.HOSPITAL_ADMIN, hospital=ha, group=g1),
        "DR": _user("ord_dr@t.com", "Dr Ord", Role.DOCTOR, hospital=ha, group=g1),
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


async def seed_item(client, token, name, code, **extra):
    body = {"name": name, "code": code, **extra}
    r = await client.post("/api/v1/inventory/items/", headers=auth(token), json=body)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def seed_stock(client, token, hospital_id, item_id, quantity, **extra):
    body = {"hospital_id": hospital_id, "item_id": item_id, "quantity": quantity, **extra}
    r = await client.post("/api/v1/inventory/hospital/", headers=auth(token), json=body)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def seed_consumption(client, token, hospital_id, item_id, qty, days_ago):
    from datetime import datetime, timezone, timedelta
    r = await client.post("/api/v1/inventory/transactions/", headers=auth(token), json={
        "hospital_id": hospital_id, "item_id": item_id,
        "transaction_type": "CONSUMPTION", "previous_balance": 0, "quantity": qty,
        "transaction_date": (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat(),
    })
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_suggestions_use_initial_estimate_fallback(client: AsyncClient, seed):
    sa = await login(client, "ord_sa@t.com")
    item_id = await seed_item(client, sa, "Gauze", "GAZ-1", initial_estimated_monthly_usage=30, minimum_stock=5)
    await seed_stock(client, sa, seed["HA_ID"], item_id, 10, minimum_stock=5)

    token = await login(client, "ord_ha@t.com")
    r = await client.get("/api/v1/inventory/monthly-orders/suggestions",
                         headers=auth(token),
                         params={"hospital_id": seed["HA_ID"], "order_period": "2026-08"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["hospital_id"] == seed["HA_ID"]
    assert len(body["items"]) == 1
    it = body["items"][0]
    assert it["item_name"] == "Gauze"
    assert it["avg_monthly_usage"] == 30
    assert it["usage_source"] == "estimated"
    # suggested = max(30 - 10, 5 - 10) = 20
    assert it["suggested_quantity"] == 20
    assert body["estimated_cost_total"] == round(20 * it["unit_cost"], 2)


@pytest.mark.asyncio
async def test_suggestions_use_calculated_consumption(client: AsyncClient, seed):
    sa = await login(client, "ord_sa@t.com")
    item_id = await seed_item(client, sa, "Suture", "SUT-1", initial_estimated_monthly_usage=100, minimum_stock=5)
    await seed_stock(client, sa, seed["HA_ID"], item_id, 10, minimum_stock=5)
    # 40 units consumed in each of 2 months -> avg usage 40, source calculated
    await seed_consumption(client, sa, seed["HA_ID"], item_id, 40, days_ago=75)
    await seed_consumption(client, sa, seed["HA_ID"], item_id, 40, days_ago=15)

    token = await login(client, "ord_ha@t.com")
    r = await client.get("/api/v1/inventory/monthly-orders/suggestions",
                         headers=auth(token),
                         params={"hospital_id": seed["HA_ID"], "order_period": "2026-08"})
    assert r.status_code == 200, r.text
    it = r.json()["items"][0]
    assert it["usage_source"] == "calculated"
    assert it["avg_monthly_usage"] == 40
    # suggested = 40 - 10 = 30
    assert it["suggested_quantity"] == 30


@pytest.mark.asyncio
async def test_order_lifecycle_and_rbac(client: AsyncClient, seed):
    sa = await login(client, "ord_sa@t.com")
    item_id = await seed_item(client, sa, "Gloves", "GLV-2", initial_estimated_monthly_usage=20, minimum_stock=5)
    await seed_stock(client, sa, seed["HA_ID"], item_id, 8, minimum_stock=5)

    ha = await login(client, "ord_ha@t.com")
    ga = await login(client, "ord_ga@t.com")
    dr = await login(client, "ord_dr@t.com")

    # Doctor cannot create an order
    r = await client.post("/api/v1/inventory/monthly-orders/", headers=auth(dr), json={
        "hospital_id": seed["HA_ID"], "order_period": "2026-08"})
    assert r.status_code == 403

    # HA creates DRAFT
    r = await client.post("/api/v1/inventory/monthly-orders/", headers=auth(ha), json={
        "hospital_id": seed["HA_ID"], "order_period": "2026-08", "notes": "monthly restock"})
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["status"] == "DRAFT"
    assert len(order["items"]) == 1
    assert order["notes"] == "monthly restock"

    # Duplicate period -> 409
    r = await client.post("/api/v1/inventory/monthly-orders/", headers=auth(ha), json={
        "hospital_id": seed["HA_ID"], "order_period": "2026-08"})
    assert r.status_code == 409

    # Edit required qty while draft
    oid = order["id"]
    r = await client.put(f"/api/v1/inventory/monthly-orders/{oid}", headers=auth(ha), json={
        "items": [{"item_id": item_id, "required_quantity": 25}]})
    assert r.status_code == 200, r.text
    assert r.json()["items"][0]["required_quantity"] == 25

    # HA submits
    r = await client.post(f"/api/v1/inventory/monthly-orders/{oid}/transition", headers=auth(ha),
                          json={"to_status": "SUBMITTED"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "SUBMITTED"
    assert r.json()["submitted_date"] is not None

    # HA cannot review (GA-only approval step)
    r = await client.post(f"/api/v1/inventory/monthly-orders/{oid}/transition", headers=auth(ha),
                          json={"to_status": "REVIEWED"})
    assert r.status_code == 403

    # No longer editable after submission
    r = await client.put(f"/api/v1/inventory/monthly-orders/{oid}", headers=auth(ha), json={"notes": "x"})
    assert r.status_code == 400

    # GA: review -> approve -> order -> complete
    for step, expected_date in [("REVIEWED", "reviewed_date"), ("APPROVED", "approved_date"),
                                ("ORDERED", "ordered_date"), ("COMPLETED", "completed_date")]:
        r = await client.post(f"/api/v1/inventory/monthly-orders/{oid}/transition", headers=auth(ga),
                              json={"to_status": step})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == step
        assert r.json()[expected_date] is not None

    # Cannot go back / skip from COMPLETED
    r = await client.post(f"/api/v1/inventory/monthly-orders/{oid}/transition", headers=auth(ga),
                          json={"to_status": "APPROVED"})
    assert r.status_code == 400

    # Cannot delete non-draft
    r = await client.delete(f"/api/v1/inventory/monthly-orders/{oid}", headers=auth(ha))
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_invalid_transition_requires_ga(client: AsyncClient, seed):
    sa = await login(client, "ord_sa@t.com")
    item_id = await seed_item(client, sa, "Mask", "MSK-1")
    await seed_stock(client, sa, seed["HA_ID"], item_id, 10)
    ha = await login(client, "ord_ha@t.com")
    r = await client.post("/api/v1/inventory/monthly-orders/", headers=auth(ha), json={
        "hospital_id": seed["HA_ID"], "order_period": "2026-09"})
    oid = r.json()["id"]

    # Skip transition DRAFT -> APPROVED
    ga = await login(client, "ord_ga@t.com")
    r = await client.post(f"/api/v1/inventory/monthly-orders/{oid}/transition", headers=auth(ga),
                          json={"to_status": "APPROVED"})
    assert r.status_code == 400

    # Bogus status
    r = await client.post(f"/api/v1/inventory/monthly-orders/{oid}/transition", headers=auth(ga),
                          json={"to_status": "NOPE"})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_consolidated_orders_matrix(client: AsyncClient, seed):
    sa = await login(client, "ord_sa@t.com")
    item_a = await seed_item(client, sa, "Cement", "CEM-1", initial_estimated_monthly_usage=10, minimum_stock=2)
    item_b = await seed_item(client, sa, "Bonding", "BND-1", initial_estimated_monthly_usage=10, minimum_stock=2)
    await seed_stock(client, sa, seed["HA_ID"], item_a, 5, minimum_stock=2)
    await seed_stock(client, sa, seed["HA_ID"], item_b, 5, minimum_stock=2)
    await seed_stock(client, sa, seed["HB_ID"], item_a, 8, minimum_stock=2)

    ga = await login(client, "ord_ga@t.com")
    for hid in (seed["HA_ID"], seed["HB_ID"]):
        r = await client.post("/api/v1/inventory/monthly-orders/", headers=auth(ga), json={
            "hospital_id": hid, "order_period": "2026-10"})
        assert r.status_code == 201, r.text

    r = await client.get("/api/v1/inventory/monthly-orders/consolidated", headers=auth(ga),
                         params={"order_period": "2026-10"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["hospitals"]) == 2
    names = {it["item_name"] for it in body["items"]}
    assert names == {"Cement", "Bonding"}
    cement = next(it for it in body["items"] if it["item_name"] == "Cement")
    assert seed["HA_ID"] in cement["hospitals"]
    assert cement["hospitals"][seed["HA_ID"]]["required_quantity"] > 0
    assert "Order Hosp A" in [h["hospital_name"] for h in body["hospitals"]]
    assert body["grand_total_quantity"] > 0


@pytest.mark.asyncio
async def test_item_insights_and_transfer_suggestions(client: AsyncClient, seed):
    sa = await login(client, "ord_sa@t.com")
    item_id = await seed_item(client, sa, "Anesth Lido", "LID-1", initial_estimated_monthly_usage=10, minimum_stock=5)
    await seed_stock(client, sa, seed["HA_ID"], item_id, 2, minimum_stock=5)   # below min
    await seed_stock(client, sa, seed["HB_ID"], item_id, 100, minimum_stock=5)  # surplus

    ga = await login(client, "ord_ga@t.com")
    r = await client.get("/api/v1/inventory/insights/item", headers=auth(ga),
                         params={"hospital_id": seed["HA_ID"], "item_id": item_id})
    assert r.status_code == 200, r.text
    ins = r.json()
    assert ins["status"] == "Critical" or ins["status"] == "Low"
    assert ins["avg_monthly_usage"] == 10
    assert ins["suggested_quantity"] > 0
    assert ins["messages"]

    r = await client.get("/api/v1/inventory/insights/transfer-suggestions", headers=auth(ga),
                         params={"hospital_ids": f"{seed['HA_ID']},{seed['HB_ID']}", "item_ids": item_id})
    assert r.status_code == 200, r.text
    suggestions = r.json()
    assert suggestions, "expected a transfer suggestion"
    assert suggestions[0]["from_hospital_id"] == seed["HB_ID"]
    assert suggestions[0]["to_hospital_id"] == seed["HA_ID"]
    assert suggestions[0]["suggested_quantity"] > 0


@pytest.mark.asyncio
async def test_inventory_reports_endpoint(client: AsyncClient, seed):
    sa = await login(client, "ord_sa@t.com")
    item_id = await seed_item(client, sa, "Scalpel", "SCL-1", minimum_stock=3)
    await seed_stock(client, sa, seed["HA_ID"], item_id, 12, minimum_stock=3)
    # Two outflows ~60 days apart -> calculated usage (6 avg), 12 total consumption
    await seed_consumption(client, sa, seed["HA_ID"], item_id, 6, days_ago=75)
    await seed_consumption(client, sa, seed["HA_ID"], item_id, 6, days_ago=15)

    token = await login(client, "ord_ha@t.com")
    r = await client.get("/api/v1/reports/inventory", headers=auth(token),
                         params={"report_type": "current_stock"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["report_type"] == "current_stock"
    assert len(body["rows"]) == 1
    assert body["rows"][0][1] == "Scalpel"

    r = await client.get("/api/v1/reports/inventory", headers=auth(token),
                         params={"report_type": "usage"})
    assert r.status_code == 200, r.text
    row = r.json()["rows"][0]
    assert row[3] == 12     # consumption (3 mo)
    assert row[4] == 6      # avg monthly usage
    assert row[5] == "calculated"  # usage source

    r = await client.get("/api/v1/reports/inventory", headers=auth(token),
                         params={"report_type": "stock_status"})
    assert r.status_code == 200, r.text
    row = r.json()["rows"][0]
    assert row[7] == "Healthy"

    r = await client.get("/api/v1/reports/inventory", headers=auth(token),
                         params={"report_type": "transactions"})
    assert r.status_code == 200, r.text
    assert len(r.json()["rows"]) == 2

    # Unknown report type -> 400
    r = await client.get("/api/v1/reports/inventory", headers=auth(token),
                         params={"report_type": "nope"})
    assert r.status_code == 400

    # CSV export
    r = await client.get("/api/v1/reports/inventory", headers=auth(token),
                         params={"report_type": "current_stock", "format": "csv"})
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]


@pytest.mark.asyncio
async def test_transactions_are_immutable(client: AsyncClient, seed):
    sa = await login(client, "ord_sa@t.com")
    item_id = await seed_item(client, sa, "Syringe", "SYR-1")
    r = await client.post("/api/v1/inventory/transactions/", headers=auth(sa), json={
        "hospital_id": seed["HA_ID"], "item_id": item_id,
        "transaction_type": "OPENING_STOCK", "previous_balance": 0, "quantity": 20,
    })
    assert r.status_code == 201
    txn_id = r.json()["id"]

    # No update / delete endpoints
    r = await client.put(f"/api/v1/inventory/transactions/{txn_id}", headers=auth(sa), json={"quantity": 5})
    assert r.status_code == 405
    r = await client.delete(f"/api/v1/inventory/transactions/{txn_id}", headers=auth(sa))
    assert r.status_code == 405


@pytest.mark.asyncio
async def test_ha_can_manage_suppliers(client: AsyncClient, seed):
    ha = await login(client, "ord_ha@t.com")
    r = await client.post("/api/v1/inventory/suppliers/", headers=auth(ha), json={"name": "HA Supplier"})
    assert r.status_code == 201, r.text
