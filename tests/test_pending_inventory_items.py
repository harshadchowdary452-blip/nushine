"""Phase 2B tests: pending inventory items (Others workflow) + GA monthly order
overview + consolidated report type."""
import pytest
from httpx import AsyncClient

from app.core.permissions import Role
from app.core.security import hash_password
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User


@pytest.fixture
async def seed(db_session):
    g1 = AdminGroup(name="Pending Group", description="")
    db_session.add(g1)
    await db_session.flush()
    ha = Hospital(admin_group_id=g1.id, name="Pending Hosp A")
    hb = Hospital(admin_group_id=g1.id, name="Pending Hosp B")
    db_session.add_all([ha, hb])
    await db_session.flush()

    def _user(email, name, role, hospital=None, group=None):
        return User(email=email, password_hash=hash_password("TestPass123"), full_name=name,
                    role=role, hospital_id=hospital.id if hospital else None,
                    admin_group_id=group.id if group else None,
                    is_active=True, is_verified=True)

    users = {
        "SA": _user("pen_sa@t.com", "SA", Role.SUPER_ADMIN),
        "GA": _user("pen_ga@t.com", "GA", Role.GROUP_ADMIN, group=g1),
        "HA": _user("pen_ha@t.com", "HA", Role.HOSPITAL_ADMIN, hospital=ha, group=g1),
        "HB": _user("pen_hb@t.com", "HB", Role.HOSPITAL_ADMIN, hospital=hb, group=g1),
        "DR": _user("pen_dr@t.com", "Dr Pen", Role.DOCTOR, hospital=ha, group=g1),
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
    r = await client.post("/api/v1/inventory/items/", headers=auth(token), json={"name": name, "code": code, **extra})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def create_pending(client, token, item_name, **extra):
    return await client.post("/api/v1/inventory/pending-items/", headers=auth(token),
                             json={"item_name": item_name, **extra})


@pytest.mark.asyncio
async def test_ha_creates_pending_item_and_duplicate_conflicts(client: AsyncClient, seed):
    ha = await login(client, "pen_ha@t.com")
    r = await create_pending(client, ha, "Novel Paste", estimated_cost=500, remarks="for new composite")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "PENDING"
    assert body["hospital_name"] == "Pending Hosp A"
    assert body["estimated_cost"] == 500
    assert body["remarks"] == "for new composite"

    r = await create_pending(client, ha, "novel paste")
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_pending_item_rbac(client: AsyncClient, seed):
    ga = await login(client, "pen_ga@t.com")
    dr = await login(client, "pen_dr@t.com")

    # GA cannot request (only hospital admins may)
    r = await create_pending(client, ga, "GA Request")
    assert r.status_code == 403

    # Doctor cannot request (no MANAGE_INVENTORY)
    r = await create_pending(client, dr, "Dr Request")
    assert r.status_code == 403

    # Doctor can list
    r = await client.get("/api/v1/inventory/pending-items/", headers=auth(dr))
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_ha_cannot_review_and_list_is_hospital_scoped(client: AsyncClient, seed):
    ha = await login(client, "pen_ha@t.com")
    hb = await login(client, "pen_hb@t.com")
    r = await create_pending(client, ha, "Scoped Item")
    pid = r.json()["id"]

    # Hospital B cannot see hospital A's pending item
    r = await client.get(f"/api/v1/inventory/pending-items/{pid}", headers=auth(hb))
    assert r.status_code == 403

    # Hospital A can
    r = await client.get(f"/api/v1/inventory/pending-items/{pid}", headers=auth(ha))
    assert r.status_code == 200

    # HA cannot review
    r = await client.post(f"/api/v1/inventory/pending-items/{pid}/review", headers=auth(ha),
                          json={"action": "APPROVE"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_ga_merge_links_existing_master_item(client: AsyncClient, seed):
    sa = await login(client, "pen_sa@t.com")
    ha = await login(client, "pen_ha@t.com")
    ga = await login(client, "pen_ga@t.com")

    gauze_id = await seed_item(client, sa, "Gauze", "GAZ-2")
    r = await create_pending(client, ha, "Gauze")
    pid = r.json()["id"]

    r = await client.post(f"/api/v1/inventory/pending-items/{pid}/review", headers=auth(ga),
                          json={"action": "MERGE", "merge_item_id": gauze_id, "review_notes": "already in catalogue"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "MERGED"
    assert body["converted_item_id"] == gauze_id
    assert body["reviewed_by"]

    # Merged item is now linked into the hospital's inventory
    r = await client.get("/api/v1/inventory/hospital/", headers=auth(ha))
    assert r.status_code == 200
    items = r.json()["items"]
    assert any(it["item_id"] == gauze_id for it in items)


@pytest.mark.asyncio
async def test_ga_convert_creates_master_item(client: AsyncClient, seed):
    ha = await login(client, "pen_ha@t.com")
    ga = await login(client, "pen_ga@t.com")

    r = await create_pending(client, ha, "Custom Polishing Paste", estimated_cost=750, unit="TUBE")
    pid = r.json()["id"]

    r = await client.post(f"/api/v1/inventory/pending-items/{pid}/review", headers=auth(ga),
                          json={"action": "CONVERT", "unit": "TUBE", "review_notes": "adding to catalogue"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "CONVERTED"
    assert body["converted_item_id"]
    assert body["unit"] == "TUBE"

    # Master catalogue now has the item (search by name)
    r = await client.get("/api/v1/inventory/items/", headers=auth(ga),
                         params={"search": "Custom Polishing Paste"})
    assert r.status_code == 200, r.text
    found = [it for it in r.json()["items"] if it["id"] == body["converted_item_id"]]
    assert len(found) == 1
    assert found[0]["code"].startswith("ITM-")


@pytest.mark.asyncio
async def test_ga_reject_and_no_re_review(client: AsyncClient, seed):
    ha = await login(client, "pen_ha@t.com")
    ga = await login(client, "pen_ga@t.com")

    r = await create_pending(client, ha, "Reject Me")
    pid = r.json()["id"]
    r = await client.post(f"/api/v1/inventory/pending-items/{pid}/review", headers=auth(ga),
                          json={"action": "REJECT", "review_notes": "duplicate"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "REJECTED"
    assert r.json()["review_notes"] == "duplicate"

    # Already reviewed -> 400
    r = await client.post(f"/api/v1/inventory/pending-items/{pid}/review", headers=auth(ga),
                          json={"action": "APPROVE"})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_ga_monthly_order_overview(client: AsyncClient, seed):
    sa = await login(client, "pen_sa@t.com")
    ha = await login(client, "pen_ha@t.com")
    ga = await login(client, "pen_ga@t.com")

    item_id = await seed_item(client, sa, "Gloves", "GLV-9", initial_estimated_monthly_usage=20, minimum_stock=5, purchase_price=100, average_cost=100)
    r = await client.post("/api/v1/inventory/hospital/", headers=auth(sa),
                          json={"hospital_id": seed["HA_ID"], "item_id": item_id, "quantity": 8, "minimum_stock": 5})
    assert r.status_code == 201, r.text

    r = await client.post("/api/v1/inventory/monthly-orders/", headers=auth(ha),
                          json={"hospital_id": seed["HA_ID"], "order_period": "2026-11"})
    assert r.status_code == 201, r.text
    oid = r.json()["id"]
    await client.post(f"/api/v1/inventory/monthly-orders/{oid}/transition", headers=auth(ha),
                      json={"to_status": "SUBMITTED"})

    r = await client.get("/api/v1/inventory/monthly-orders/overview", headers=auth(ga),
                         params={"order_period": "2026-11"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["order_period"] == "2026-11"
    assert len(body["hospitals"]) == 2
    a_row = next(h for h in body["hospitals"] if h["hospital_id"] == seed["HA_ID"])
    b_row = next(h for h in body["hospitals"] if h["hospital_id"] == seed["HB_ID"])
    assert a_row["has_order"] is True
    assert a_row["status"] == "SUBMITTED"
    assert a_row["submitted_date"] is not None
    assert a_row["items_requested"] == 1
    assert a_row["estimated_cost"] > 0
    assert a_row["current_remaining_stock"] == 8
    assert b_row["has_order"] is False
    assert body["orders_submitted"] == 1
    assert body["orders_total"] == 2

    # HA overview only shows own hospital
    r = await client.get("/api/v1/inventory/monthly-orders/overview", headers=auth(ha),
                         params={"order_period": "2026-11"})
    assert r.status_code == 200, r.text
    assert len(r.json()["hospitals"]) == 1


@pytest.mark.asyncio
async def test_consolidated_report_type(client: AsyncClient, seed):
    sa = await login(client, "pen_sa@t.com")
    ga = await login(client, "pen_ga@t.com")

    item_id = await seed_item(client, sa, "Bonding", "BND-9", initial_estimated_monthly_usage=10, minimum_stock=2)
    await client.post("/api/v1/inventory/hospital/", headers=auth(sa),
                      json={"hospital_id": seed["HA_ID"], "item_id": item_id, "quantity": 5, "minimum_stock": 2})
    await client.post("/api/v1/inventory/hospital/", headers=auth(sa),
                      json={"hospital_id": seed["HB_ID"], "item_id": item_id, "quantity": 7, "minimum_stock": 2})
    for hid in (seed["HA_ID"], seed["HB_ID"]):
        r = await client.post("/api/v1/inventory/monthly-orders/", headers=auth(ga),
                              json={"hospital_id": hid, "order_period": "2026-12"})
        assert r.status_code == 201, r.text

    r = await client.get("/api/v1/reports/inventory", headers=auth(ga),
                         params={"report_type": "consolidated", "order_period": "2026-12"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["report_label"] == "Group Consolidated Order"
    # Item appears once, with one column per hospital plus a combined total
    assert len(body["rows"]) == 1
    assert "Pending Hosp A" in body["headers"]
    assert "Pending Hosp B" in body["headers"]
    assert "Total Required" in body["headers"]
    assert "Code" not in body["headers"]
    assert "Brand" not in body["headers"]
    assert "Current Stock" not in body["headers"]
    assert body["summary"] and body["summary"][0]["label"] == "Total Est. Cost"

    # search filters rows
    r = await client.get("/api/v1/reports/inventory", headers=auth(ga),
                         params={"report_type": "consolidated", "order_period": "2026-12",
                                 "search": "nonexistent"})
    assert r.status_code == 200, r.text
    assert r.json()["rows"] == []


# ── Phase 2C-2: Master Inventory Continuous Improvement ─────────────────


async def hospital_item_ids(client, token, hospital_id):
    r = await client.get("/api/v1/inventory/hospital/", headers=auth(token),
                         params={"hospital_id": hospital_id})
    assert r.status_code == 200, r.text
    return {it["item_id"] for it in r.json()["items"]}


async def master_search(client, token, search):
    r = await client.get("/api/v1/inventory/items/", headers=auth(token), params={"search": search})
    assert r.status_code == 200, r.text
    return r.json()["items"]


@pytest.mark.asyncio
async def test_duplicate_detection_smart_matches(client: AsyncClient, seed):
    sa = await login(client, "pen_sa@t.com")
    ha = await login(client, "pen_ha@t.com")
    ga = await login(client, "pen_ga@t.com")

    await seed_item(client, sa, "Composite Syringe", "CSY-1")
    await seed_item(client, sa, "Composite", "CSY-2")
    await seed_item(client, sa, "Gauze Roll", "GRL-1")

    # Plural + capitalisation variant resolves to the exact master item
    r = await client.get("/api/v1/inventory/pending-items/duplicates", headers=auth(ga),
                         params={"name": "composite syringes"})
    assert r.status_code == 200, r.text
    cands = r.json()["candidates"]
    assert cands[0]["match_type"] == "EXACT"
    assert cands[0]["name"] == "Composite Syringe"
    names = [c["name"] for c in cands]
    assert "Composite" in names  # fuzzy suggestion

    # A genuinely new material has no candidates
    r = await client.get("/api/v1/inventory/pending-items/duplicates", headers=auth(ha),
                         params={"name": "Molar Band Separator"})
    assert r.status_code == 200
    assert r.json()["candidates"] == []


@pytest.mark.asyncio
async def test_merge_requires_target(client: AsyncClient, seed):
    ha = await login(client, "pen_ha@t.com")
    ga = await login(client, "pen_ga@t.com")
    r = await create_pending(client, ha, "Anything")
    pid = r.json()["id"]
    r = await client.post(f"/api/v1/inventory/pending-items/{pid}/review", headers=auth(ga),
                          json={"action": "MERGE"})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_approve_creates_new_master_and_rolls_out_to_all(client: AsyncClient, seed):
    sa = await login(client, "pen_sa@t.com")
    ha = await login(client, "pen_ha@t.com")
    hb = await login(client, "pen_hb@t.com")
    ga = await login(client, "pen_ga@t.com")

    # A similar item exists but the GA explicitly chooses to create a new one
    await seed_item(client, sa, "Composite", "CSY-9")
    r = await create_pending(client, ha, "Composite Pro Max", estimated_cost=1200)
    pid = r.json()["id"]

    r = await client.post(f"/api/v1/inventory/pending-items/{pid}/review", headers=auth(ga),
                          json={"action": "APPROVE", "rollout": "ALL", "review_notes": "new product line"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "APPROVED"
    assert body["rollout"] == "ALL"
    assert body["requested_by_name"] == "HA"
    assert body["reviewed_by_name"] == "GA"
    new_id = body["converted_item_id"]

    # New master item created under Others with an ITM- code
    found = await master_search(client, ga, "Composite Pro Max")
    assert any(it["id"] == new_id and it["code"].startswith("ITM-") for it in found)
    assert found[0]["category_name"] == "Others"

    # Rollout ALL -> both hospitals in the group now carry the item
    assert new_id in await hospital_item_ids(client, ha, seed["HA_ID"])
    assert new_id in await hospital_item_ids(client, hb, seed["HB_ID"])


@pytest.mark.asyncio
async def test_rollout_new_hospitals_only_leaves_others_untouched(client: AsyncClient, seed):
    ha = await login(client, "pen_ha@t.com")
    hb = await login(client, "pen_hb@t.com")
    ga = await login(client, "pen_ga@t.com")

    r = await create_pending(client, ha, "Exclusive Polish", estimated_cost=300)
    pid = r.json()["id"]
    r = await client.post(f"/api/v1/inventory/pending-items/{pid}/review", headers=auth(ga),
                          json={"action": "APPROVE", "rollout": "NEW_ONLY"})
    assert r.status_code == 200, r.text
    new_id = r.json()["converted_item_id"]

    # Only the requesting hospital receives it now
    assert new_id in await hospital_item_ids(client, ha, seed["HA_ID"])
    assert new_id not in await hospital_item_ids(client, hb, seed["HB_ID"])


@pytest.mark.asyncio
async def test_reject_never_creates_master_item(client: AsyncClient, seed):
    ha = await login(client, "pen_ha@t.com")
    ga = await login(client, "pen_ga@t.com")

    r = await create_pending(client, ha, "Not Allowed Material")
    pid = r.json()["id"]
    r = await client.post(f"/api/v1/inventory/pending-items/{pid}/review", headers=auth(ga),
                          json={"action": "REJECT", "review_notes": "out of policy"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "REJECTED"
    assert body["review_notes"] == "out of policy"
    assert body["reviewed_by_name"] == "GA"

    # Not in the master catalogue
    found = await master_search(client, ga, "Not Allowed Material")
    assert found == []

    # Still visible to the requesting hospital (historical monthly indent)
    r = await client.get("/api/v1/inventory/pending-items/", headers=auth(ha),
                         params={"order_period": body["order_period"]})
    assert r.status_code == 200
    assert any(it["id"] == pid and it["status"] == "REJECTED" for it in r.json()["items"])


@pytest.mark.asyncio
async def test_ga_edits_pending_item(client: AsyncClient, seed):
    ha = await login(client, "pen_ha@t.com")
    ga = await login(client, "pen_ga@t.com")

    r = await create_pending(client, ha, "Rough Name", estimated_cost=100, remarks="typo")
    pid = r.json()["id"]

    r = await client.put(f"/api/v1/inventory/pending-items/{pid}", headers=auth(ga),
                         json={"item_name": "Correct Name", "estimated_cost": 250})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["item_name"] == "Correct Name"
    assert body["estimated_cost"] == 250

    # Non-admin cannot edit
    r = await client.put(f"/api/v1/inventory/pending-items/{pid}", headers=auth(ha),
                         json={"item_name": "Hijacked"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_order_period_scoping(client: AsyncClient, seed):
    ha = await login(client, "pen_ha@t.com")
    ga = await login(client, "pen_ga@t.com")

    r = await create_pending(client, ha, "Period One", order_period="2026-09")
    assert r.status_code == 201
    r = await create_pending(client, ha, "Period Two", order_period="2026-10")
    assert r.status_code == 201

    r = await client.get("/api/v1/inventory/pending-items/", headers=auth(ga),
                         params={"order_period": "2026-09"})
    assert r.status_code == 200
    names = [it["item_name"] for it in r.json()["items"]]
    assert names == ["Period One"]
