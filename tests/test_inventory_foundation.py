"""Phase 2A-1 tests: enterprise inventory foundation (categories, suppliers,
inventory master, hospital stock, transaction ledger)."""
import pytest
from httpx import AsyncClient

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User


@pytest.fixture
async def seed(db_session):
    g1 = AdminGroup(name="Inv Group One", description="")
    db_session.add(g1)
    await db_session.flush()
    ha = Hospital(admin_group_id=g1.id, name="Inv Hosp A")
    hb = Hospital(admin_group_id=g1.id, name="Inv Hosp B")
    db_session.add_all([ha, hb])
    await db_session.flush()

    def _user(email, name, role, hospital=None, group=None):
        return User(email=email, password_hash=hash_password("TestPass123"), full_name=name,
                    role=role, hospital_id=hospital.id if hospital else None,
                    admin_group_id=group.id if group else None,
                    is_active=True, is_verified=True)

    users = {
        "SA": _user("inv_sa@t.com", "SA", Role.SUPER_ADMIN),
        "GA": _user("inv_ga@t.com", "GA", Role.GROUP_ADMIN, group=g1),
        "HA": _user("inv_ha@t.com", "HA", Role.HOSPITAL_ADMIN, hospital=ha, group=g1),
        "DR": _user("inv_dr@t.com", "Dr Inv", Role.DOCTOR, hospital=ha, group=g1),
    }
    db_session.add_all(list(users.values()))
    await db_session.commit()
    return {"g1": g1.id, "HA_ID": ha.id, "HB_ID": hb.id,
            **{k: v.id for k, v in users.items()}}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_category_crud_and_duplicate(client: AsyncClient, seed):
    token = await login(client, "inv_sa@t.com")
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.post("/api/v1/inventory/categories/", headers=headers, json={
        "name": "Diagnosis", "code": "DIAG", "sort_order": 1,
    })
    assert r.status_code == 201, r.text
    cat_id = r.json()["id"]
    assert r.json()["name"] == "Diagnosis"

    # Duplicate top-level name -> 409
    r = await client.post("/api/v1/inventory/categories/", headers=headers, json={"name": "Diagnosis"})
    assert r.status_code == 409

    # Sub-category under a parent
    r = await client.post("/api/v1/inventory/categories/", headers=headers, json={
        "name": "X-Ray", "parent_id": cat_id,
    })
    assert r.status_code == 201, r.text
    sub_id = r.json()["id"]

    # Update
    r = await client.put(f"/api/v1/inventory/categories/{cat_id}", headers=headers, json={"name": "Diagnostics"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Diagnostics"

    # Tree
    r = await client.get("/api/v1/inventory/categories/tree", headers=headers)
    assert r.status_code == 200
    tree = r.json()
    assert any(c["name"] == "Diagnostics" for c in tree)

    # Parent with children cannot be deleted
    r = await client.delete(f"/api/v1/inventory/categories/{cat_id}", headers=headers)
    assert r.status_code == 409

    # Leaf can be deleted
    r = await client.delete(f"/api/v1/inventory/categories/{sub_id}", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_supplier_crud(client: AsyncClient, seed):
    token = await login(client, "inv_ga@t.com")
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.post("/api/v1/inventory/suppliers/", headers=headers, json={
        "name": "Dental Supplies Co", "code": "SUP-01", "gst_number": "GST123",
        "contact_person": "John",
    })
    assert r.status_code == 201, r.text
    sup_id = r.json()["id"]

    r = await client.post("/api/v1/inventory/suppliers/", headers=headers, json={"name": "Dup", "code": "SUP-01"})
    assert r.status_code == 409

    r = await client.get("/api/v1/inventory/suppliers/", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 1

    r = await client.put(f"/api/v1/inventory/suppliers/{sup_id}", headers=headers, json={"name": "Dental Co Updated"})
    assert r.status_code == 200
    assert r.json()["name"] == "Dental Co Updated"

    r = await client.delete(f"/api/v1/inventory/suppliers/{sup_id}", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_inventory_item_crud_with_categories(client: AsyncClient, seed):
    token = await login(client, "inv_ga@t.com")
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.post("/api/v1/inventory/categories/", headers=headers, json={"name": "Restorative"})
    assert r.status_code == 201
    cat_id = r.json()["id"]

    r = await client.post("/api/v1/inventory/suppliers/", headers=headers, json={"name": "Resto Supplier"})
    assert r.status_code == 201
    sup_id = r.json()["id"]

    r = await client.post("/api/v1/inventory/items/", headers=headers, json={
        "name": "Composite Filling", "code": "COMP-001", "category_id": cat_id,
        "preferred_vendor_id": sup_id, "unit": "PCS", "purchase_price": 250.0,
        "minimum_stock": 5, "reorder_level": 10, "critical_level": 3, "maximum_stock": 100,
        "batch_tracking": True, "expiry_tracking": True,
    })
    assert r.status_code == 201, r.text
    item_id = r.json()["id"]
    assert r.json()["category_name"] == "Restorative"
    assert r.json()["preferred_vendor_name"] == "Resto Supplier"

    # Duplicate code -> 409
    r = await client.post("/api/v1/inventory/items/", headers=headers, json={
        "name": "Composite Filling 2", "code": "COMP-001",
    })
    assert r.status_code == 409

    # Invalid category -> 404
    r = await client.post("/api/v1/inventory/items/", headers=headers, json={
        "name": "Bad Cat Item", "code": "BAD-001", "category_id": "00000000-0000-0000-0000-000000000000",
    })
    assert r.status_code == 404

    # Search
    r = await client.get("/api/v1/inventory/items/", headers=headers, params={"search": "composite"})
    assert r.status_code == 200
    assert r.json()["total"] == 1

    # Update
    r = await client.put(f"/api/v1/inventory/items/{item_id}", headers=headers, json={"purchase_price": 300.0})
    assert r.status_code == 200
    assert r.json()["purchase_price"] == 300.0

    # Delete item (no stock/transactions yet)
    r = await client.delete(f"/api/v1/inventory/items/{item_id}", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_hospital_inventory_scoping(client: AsyncClient, seed):
    ha_token = await login(client, "inv_ha@t.com")
    sa_token = await login(client, "inv_sa@t.com")
    dr_token = await login(client, "inv_dr@t.com")

    # Setup shared catalog item (global, visible to all).
    r = await client.post("/api/v1/inventory/items/", headers={"Authorization": f"Bearer {sa_token}"}, json={
        "name": "Gloves", "code": "GLV-100", "unit": "BOX",
    })
    assert r.status_code == 201, r.text
    item_id = r.json()["id"]

    # HA creates stock for own hospital -> ok; hospital_id forced to own.
    r = await client.post("/api/v1/inventory/hospital/", headers={"Authorization": f"Bearer {ha_token}"}, json={
        "hospital_id": seed["HB_ID"], "item_id": item_id, "quantity": 20,
    })
    assert r.status_code == 201, r.text
    assert r.json()["hospital_id"] == seed["HA_ID"]

    # Duplicate stock row for same hospital+item -> 409
    r = await client.post("/api/v1/inventory/hospital/", headers={"Authorization": f"Bearer {ha_token}"}, json={
        "hospital_id": seed["HA_ID"], "item_id": item_id,
    })
    assert r.status_code == 409

    # HA list sees own hospital only.
    r = await client.get("/api/v1/inventory/hospital/", headers={"Authorization": f"Bearer {ha_token}"})
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["hospital_name"] == "Inv Hosp A"
    assert r.json()["items"][0]["item_name"] == "Gloves"

    # Doctor can view, but cannot create (manage requires permission).
    r = await client.get("/api/v1/inventory/hospital/", headers={"Authorization": f"Bearer {dr_token}"})
    assert r.status_code == 200
    r = await client.post("/api/v1/inventory/hospital/", headers={"Authorization": f"Bearer {dr_token}"}, json={
        "hospital_id": seed["HA_ID"], "item_id": item_id, "quantity": 5,
    })
    assert r.status_code == 403

    # Super admin can create for another hospital.
    r = await client.post("/api/v1/inventory/hospital/", headers={"Authorization": f"Bearer {sa_token}"}, json={
        "hospital_id": seed["HB_ID"], "item_id": item_id, "quantity": 8,
    })
    assert r.status_code == 201, r.text

    r = await client.get("/api/v1/inventory/hospital/", headers={"Authorization": f"Bearer {sa_token}"})
    assert r.json()["total"] == 2

    # Item protected from delete once it has stock.
    r = await client.delete(f"/api/v1/inventory/items/{item_id}", headers={"Authorization": f"Bearer {sa_token}"})
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_inventory_transactions_ledger(client: AsyncClient, seed):
    token = await login(client, "inv_sa@t.com")
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.post("/api/v1/inventory/items/", headers=headers, json={"name": "Anesthesia", "code": "ANE-1"})
    item_id = r.json()["id"]

    r = await client.post("/api/v1/inventory/transactions/", headers=headers, json={
        "hospital_id": seed["HA_ID"], "item_id": item_id,
        "transaction_type": "OPENING_STOCK", "previous_balance": 0, "quantity": 50,
    })
    assert r.status_code == 201, r.text
    assert r.json()["current_balance"] == 50

    # Consumption -> current = previous + quantity
    r = await client.post("/api/v1/inventory/transactions/", headers=headers, json={
        "hospital_id": seed["HA_ID"], "item_id": item_id,
        "transaction_type": "CONSUMPTION", "previous_balance": 50, "quantity": 10,
        "reason": "OPD use", "remarks": "daily consumption",
    })
    assert r.status_code == 201, r.text
    assert r.json()["current_balance"] == 60
    assert r.json()["item_name"] == "Anesthesia"

    # Invalid transaction type -> 400
    r = await client.post("/api/v1/inventory/transactions/", headers=headers, json={
        "hospital_id": seed["HA_ID"], "item_id": item_id, "transaction_type": "BOGUS", "quantity": 1,
    })
    assert r.status_code == 400

    # List by type filter
    r = await client.get("/api/v1/inventory/transactions/", headers=headers, params={"transaction_type": "OPENING_STOCK"})
    assert r.status_code == 200
    assert r.json()["total"] == 1

    # List all
    r = await client.get("/api/v1/inventory/transactions/", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 2
