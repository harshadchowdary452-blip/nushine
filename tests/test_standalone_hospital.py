"""Standalone hospital / clinic support.

A hospital may exist without an admin group. Its Hospital Admin is the Indent
Master for that hospital: they submit their monthly indent and self-approve it
through REVIEWED / APPROVED / ORDERED / COMPLETED (no Group Admin involved).
They may also self-approve "Other Item" master-catalogue requests, scoped to
their own hospital only.

Group organisations must keep working unchanged, and data must stay isolated:
a Group Admin can never touch a standalone hospital's data and vice versa.
"""
import pytest
from httpx import AsyncClient

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.user import User


@pytest.fixture
async def seed(db_session):
    sa = User(email="st_sa@t.com", password_hash=hash_password("TestPass123"),
              full_name="SA", role=Role.SUPER_ADMIN, is_active=True, is_verified=True)
    g1 = AdminGroup(name="Standalone Test Group", description="")
    db_session.add(sa)
    await db_session.flush()
    db_session.add(g1)
    await db_session.flush()
    ga = User(email="st_ga@t.com", password_hash=hash_password("TestPass123"),
              full_name="GA", role=Role.GROUP_ADMIN, admin_group_id=g1.id,
              is_active=True, is_verified=True)
    db_session.add(ga)
    await db_session.commit()
    return {"SA_ID": sa.id, "GA_ID": ga.id, "G1_ID": g1.id}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def create_hospital(client, token, name, admin_group_id=None):
    body = {"name": name}
    if admin_group_id is not None:
        body["admin_group_id"] = admin_group_id
    return await client.post("/api/v1/hospitals/", headers=auth(token), json=body)


async def create_hospital_admin(client, token, hospital_id, email):
    body = {"email": email, "password": "TestPass123", "full_name": "Hospital Admin",
            "role": "HOSPITAL_ADMIN"}
    return await client.post(f"/api/v1/hospitals/{hospital_id}/admins", headers=auth(token), json=body)


async def seed_item(client, token, name, code, **extra):
    r = await client.post("/api/v1/inventory/items/", headers=auth(token),
                          json={"name": name, "code": code, **extra})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def seed_stock(client, token, hospital_id, item_id, quantity, **extra):
    r = await client.post("/api/v1/inventory/hospital/", headers=auth(token),
                          json={"hospital_id": hospital_id, "item_id": item_id,
                                "quantity": quantity, **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def transition(client, token, order_id, to_status):
    return await client.post(
        f"/api/v1/inventory/monthly-orders/{order_id}/transition",
        headers=auth(token), json={"to_status": to_status})


async def stock_items(client, token, hospital_id):
    r = await client.get("/api/v1/inventory/hospital/", headers=auth(token),
                         params={"hospital_id": hospital_id, "page_size": 200})
    assert r.status_code == 200, r.text
    return r.json().get("items", [])


@pytest.mark.asyncio
async def test_super_admin_creates_standalone_hospital_and_admin(client: AsyncClient, seed):
    sa = await login(client, "st_sa@t.com")

    r = await create_hospital(client, sa, "Standalone Clinic")
    assert r.status_code == 201, r.text
    hospital = r.json()
    assert hospital["admin_group_id"] is None
    assert hospital["name"] == "Standalone Clinic"

    r2 = await create_hospital_admin(client, sa, hospital["id"], "st_ha@t.com")
    assert r2.status_code == 201, r2.text
    assert r2.json()["admin_group_id"] is None

    r3 = await create_hospital(client, sa, "Group Clinic", seed["G1_ID"])
    assert r3.status_code == 201, r3.text
    assert r3.json()["admin_group_id"] == seed["G1_ID"]


@pytest.mark.asyncio
async def test_standalone_hospital_admin_self_approves_monthly_indent(client: AsyncClient, seed):
    sa = await login(client, "st_sa@t.com")
    r = await create_hospital(client, sa, "Standalone Clinic")
    hospital_id = r.json()["id"]
    await create_hospital_admin(client, sa, hospital_id, "st_ha@t.com")

    item_id = await seed_item(client, sa, "Gauze", "ST-GZ-1",
                              initial_estimated_monthly_usage=30, minimum_stock=5)
    await seed_stock(client, sa, hospital_id, item_id, 10, minimum_stock=5)

    ha = await login(client, "st_ha@t.com")
    r = await client.get("/api/v1/inventory/monthly-orders/suggestions",
                         headers=auth(ha),
                         params={"hospital_id": hospital_id, "order_period": "2026-08"})
    assert r.status_code == 200, r.text

    r = await client.post("/api/v1/inventory/monthly-orders/submit", headers=auth(ha),
                          json={"hospital_id": hospital_id, "order_period": "2026-08",
                                "items": [{"item_id": item_id, "required_quantity": 20,
                                           "estimated_cost": 200}]})
    assert r.status_code == 200, r.text
    order = r.json()
    order_id = order["id"]
    assert order["status"] == "SUBMITTED"

    for to_status in ("REVIEWED", "APPROVED", "ORDERED", "COMPLETED"):
        r = await transition(client, ha, order_id, to_status)
        assert r.status_code == 200, f"{to_status}: {r.text}"
        assert r.json()["status"] == to_status


@pytest.mark.asyncio
async def test_group_workflow_unchanged_ga_approves_ha_cannot(client: AsyncClient, seed):
    ga = await login(client, "st_ga@t.com")
    sa = await login(client, "st_sa@t.com")

    r = await create_hospital(client, ga, "Group Hospital")
    assert r.status_code == 201, r.text
    hospital_id = r.json()["id"]
    assert r.json()["admin_group_id"] == seed["G1_ID"]

    await create_hospital_admin(client, ga, hospital_id, "st_gha@t.com")
    item_id = await seed_item(client, sa, "Suture", "ST-ST-1",
                              initial_estimated_monthly_usage=30, minimum_stock=5)
    await seed_stock(client, sa, hospital_id, item_id, 10, minimum_stock=5)

    gha = await login(client, "st_gha@t.com")
    r = await client.post("/api/v1/inventory/monthly-orders/submit", headers=auth(gha),
                          json={"hospital_id": hospital_id, "order_period": "2026-08",
                                "items": [{"item_id": item_id, "required_quantity": 20,
                                           "estimated_cost": 200}]})
    assert r.status_code == 200, r.text
    order_id = r.json()["id"]

    # Group-hospital hospital admin must NOT self-approve.
    r = await transition(client, gha, order_id, "APPROVED")
    assert r.status_code == 403

    # Group admin approves through the chain.
    for to_status in ("REVIEWED", "APPROVED", "ORDERED", "COMPLETED"):
        r = await transition(client, ga, order_id, to_status)
        assert r.status_code == 200, f"{to_status}: {r.text}"
        assert r.json()["status"] == to_status


@pytest.mark.asyncio
async def test_group_admin_cannot_touch_standalone_hospital_data(client: AsyncClient, seed):
    sa = await login(client, "st_sa@t.com")
    ga = await login(client, "st_ga@t.com")

    r = await create_hospital(client, sa, "Standalone Clinic")
    hospital_id = r.json()["id"]
    await create_hospital_admin(client, sa, hospital_id, "st_ha@t.com")

    item_id = await seed_item(client, sa, "Gauze", "ST-GZ-2",
                              initial_estimated_monthly_usage=30, minimum_stock=5)
    await seed_stock(client, sa, hospital_id, item_id, 10, minimum_stock=5)

    ha = await login(client, "st_ha@t.com")
    r = await client.post("/api/v1/inventory/monthly-orders/submit", headers=auth(ha),
                          json={"hospital_id": hospital_id, "order_period": "2026-08",
                                "items": [{"item_id": item_id, "required_quantity": 20,
                                           "estimated_cost": 200}]})
    order_id = r.json()["id"]

    # Group admin cannot read or edit the standalone hospital.
    r = await client.get(f"/api/v1/hospitals/{hospital_id}", headers=auth(ga))
    assert r.status_code == 403, r.text
    r = await client.put(f"/api/v1/hospitals/{hospital_id}", headers=auth(ga),
                         json={"name": "Hijacked"})
    assert r.status_code == 403, r.text

    # Group admin cannot read or advance the standalone hospital's order.
    r = await client.get(f"/api/v1/inventory/monthly-orders/{order_id}", headers=auth(ga))
    assert r.status_code == 403, r.text
    r = await transition(client, ga, order_id, "APPROVED")
    assert r.status_code == 403, r.text

    # Standalone hospital does not appear in the group admin's hospital list.
    r = await client.get("/api/v1/hospitals/", headers=auth(ga))
    assert r.status_code == 200
    assert all(h["id"] != hospital_id for h in r.json())


@pytest.mark.asyncio
async def test_standalone_hospital_admin_cannot_touch_group_hospital(client: AsyncClient, seed):
    ga = await login(client, "st_ga@t.com")
    sa = await login(client, "st_sa@t.com")

    r = await create_hospital(client, ga, "Group Hospital")
    group_hospital_id = r.json()["id"]
    await create_hospital_admin(client, ga, group_hospital_id, "st_gha@t.com")

    r = await create_hospital(client, sa, "Standalone Clinic")
    standalone_id = r.json()["id"]
    await create_hospital_admin(client, sa, standalone_id, "st_ha@t.com")

    item_id = await seed_item(client, sa, "Suture", "ST-ST-2",
                              initial_estimated_monthly_usage=30, minimum_stock=5)
    await seed_stock(client, sa, group_hospital_id, item_id, 10, minimum_stock=5)

    gha = await login(client, "st_gha@t.com")
    r = await client.post("/api/v1/inventory/monthly-orders/submit", headers=auth(gha),
                          json={"hospital_id": group_hospital_id, "order_period": "2026-08",
                                "items": [{"item_id": item_id, "required_quantity": 20,
                                           "estimated_cost": 200}]})
    group_order_id = r.json()["id"]

    ha = await login(client, "st_ha@t.com")
    r = await client.get(f"/api/v1/hospitals/{group_hospital_id}", headers=auth(ha))
    assert r.status_code == 403, r.text
    r = await transition(client, ha, group_order_id, "REVIEWED")
    assert r.status_code == 403, r.text
    r = await client.get(f"/api/v1/inventory/monthly-orders/{group_order_id}", headers=auth(ha))
    assert r.status_code == 403, r.text


@pytest.mark.asyncio
async def test_standalone_hospital_admin_self_approves_other_item_scoped_to_own_hospital(client: AsyncClient, seed):
    sa = await login(client, "st_sa@t.com")
    ga = await login(client, "st_ga@t.com")

    r = await create_hospital(client, sa, "Standalone Clinic A")
    standalone_a = r.json()["id"]
    await create_hospital_admin(client, sa, standalone_a, "st_ha_a@t.com")

    r = await create_hospital(client, sa, "Standalone Clinic B")
    standalone_b = r.json()["id"]
    await create_hospital_admin(client, sa, standalone_b, "st_ha_b@t.com")

    ha_a = await login(client, "st_ha_a@t.com")

    r = await client.post("/api/v1/inventory/pending-items/", headers=auth(ha_a),
                          json={"item_name": "Custom Material A", "required_quantity": 10,
                                "estimated_cost": 500, "order_period": "2026-08"})
    assert r.status_code == 201, r.text
    pending_id = r.json()["id"]

    # Group admin cannot review another (standalone) hospital's pending item.
    r = await client.post(f"/api/v1/inventory/pending-items/{pending_id}/review",
                          headers=auth(ga), json={"action": "APPROVE"})
    assert r.status_code == 403, r.text

    # Standalone hospital admin self-approves the request.
    r = await client.post(f"/api/v1/inventory/pending-items/{pending_id}/review",
                          headers=auth(ha_a),
                          json={"action": "APPROVE", "rollout": "ALL", "review_notes": "ok"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "APPROVED"

    items_a = await stock_items(client, ha_a, standalone_a)
    assert any(i["item_id"] == r.json()["converted_item_id"] for i in items_a)

    # Rollout must NOT leak the item to the other standalone hospital.
    ha_b = await login(client, "st_ha_b@t.com")
    items_b = await stock_items(client, ha_b, standalone_b)
    assert all(i["item_id"] != r.json()["converted_item_id"] for i in items_b)
