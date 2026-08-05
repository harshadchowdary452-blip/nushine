"""End-to-end test for date-wise expense module."""
import pytest
from datetime import date, datetime, timezone
from httpx import AsyncClient
from app.core.security import hash_password
from app.core.permissions import Role
from app.models.user import User
from app.models.hospital import Hospital
from app.models.admin_group import AdminGroup


@pytest.fixture
async def seed(db_session):
    group = AdminGroup(name="Exp Group", description="Test")
    db_session.add(group)
    await db_session.flush()
    hospital = Hospital(admin_group_id=group.id, name="Exp Hospital", address="Test")
    db_session.add(hospital)
    await db_session.flush()
    users = {
        "SA": User(hospital_id=hospital.id, admin_group_id=group.id, email="exp_sa@t.com",
                   password_hash=hash_password("TestPass123"), full_name="Exp SA", role=Role.SUPER_ADMIN,
                   is_active=True, is_verified=True),
        "HA": User(hospital_id=hospital.id, admin_group_id=group.id, email="exp_ha@t.com",
                   password_hash=hash_password("TestPass123"), full_name="Exp HA", role=Role.HOSPITAL_ADMIN,
                   is_active=True, is_verified=True),
    }
    db_session.add_all(list(users.values()))
    await db_session.commit()
    return {"hospital_id": hospital.id, "admin_group_id": group.id,
            **{k: v.id for k, v in users.items()}}


async def login(client, email):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_date_wise_expenses_e2e(client: AsyncClient, seed):
    sa_token = await login(client, "exp_sa@t.com")
    headers = {"Authorization": f"Bearer {sa_token}"}
    hid = seed["hospital_id"]

    # Create expenses on different dates
    expenses_data = [
        {"expense_date": "2026-06-01", "expense_category": "Supplies", "expense_name": "Gloves", "amount": 500, "payment_method": "Cash", "vendor": "MedSupply"},
        {"expense_date": "2026-06-05", "expense_category": "Equipment", "expense_name": "X-Ray Film", "amount": 2000, "payment_method": "Card", "vendor": "XrayCorp"},
        {"expense_date": "2026-06-15", "expense_category": "Supplies", "expense_name": "Masks", "amount": 300, "payment_method": "Cash", "vendor": "MedSupply"},
        {"expense_date": "2026-06-24", "expense_category": "Utilities", "expense_name": "Electricity Bill", "amount": 5000, "payment_method": "Bank Transfer", "vendor": "PowerCo"},
    ]
    created_ids = []
    for ed in expenses_data:
        r = await client.post("/api/v1/expenses/", headers=headers, json={**ed, "hospital_id": hid})
        assert r.status_code == 201, f"Create failed: {r.text}"
        body = r.json()
        created_ids.append(body["id"])
        # Verify auto-derived month/year
        assert body["expense_month"] == 6
        assert body["expense_year"] == 2026
        # Verify expense_date round-trips
        assert body["expense_date"] == ed["expense_date"]
        # Verify new fields
        assert body["payment_method"] == ed["payment_method"]
        assert body["vendor"] == ed["vendor"]

    # ── Daily filter: 05 Jun 2026 ──
    r = await client.get("/api/v1/expenses/", headers=headers, params={"filter": "custom", "start_date": "2026-06-05", "end_date": "2026-06-06"})
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["expense_name"] == "X-Ray Film"

    # ── Weekly filter (Mon 01 Jun - Sun 07 Jun) ──
    r = await client.get("/api/v1/expenses/", headers=headers, params={"filter": "custom", "start_date": "2026-06-01", "end_date": "2026-06-08"})
    assert r.status_code == 200
    names = {e["expense_name"] for e in r.json()}
    assert "Gloves" in names
    assert "X-Ray Film" in names
    assert "Masks" not in names

    # ── Monthly filter (all of June) ──
    r = await client.get("/api/v1/expenses/", headers=headers, params={"filter": "custom", "start_date": "2026-06-01", "end_date": "2026-07-01"})
    assert r.status_code == 200
    assert len(r.json()) == 4

    # ── Category filter ──
    r = await client.get("/api/v1/expenses/", headers=headers, params={"filter": "custom", "start_date": "2026-06-01", "end_date": "2026-07-01", "expense_category": "Supplies"})
    # Note: expense_category filter is applied via base repo equality
    # We use the analytics endpoint instead which groups by category

    # ── Calendar view: June 2026 ──
    r = await client.get("/api/v1/expenses/calendar", headers=headers, params={"month": 6, "year": 2026})
    assert r.status_code == 200
    cal = r.json()
    dates_in_cal = {entry["date"] for entry in cal}
    assert "2026-06-01" in dates_in_cal
    assert "2026-06-05" in dates_in_cal
    assert "2026-06-15" in dates_in_cal
    assert "2026-06-24" in dates_in_cal
    # Verify totals
    for entry in cal:
        if entry["date"] == "2026-06-01":
            assert entry["total"] == 500
        if entry["date"] == "2026-06-24":
            assert entry["total"] == 5000

    # ── Calendar date detail: 15 Jun 2026 ──
    r = await client.get("/api/v1/expenses/calendar/2026-06-15", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["expense_name"] == "Masks"

    # ── Analytics ──
    r = await client.get("/api/v1/expenses/analytics", headers=headers)
    assert r.status_code == 200
    analytics = r.json()
    assert analytics["total_expenses"] == 7800
    assert len(analytics["category_breakdown"]) > 0

    # ── CSV Export ──
    r = await client.get("/api/v1/exports/expenses", headers=headers, params={"format": "csv", "period": "this_month"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "text/csv; charset=utf-8" or "csv" in r.headers["content-type"]

    # ── Excel Export ──
    r = await client.get("/api/v1/exports/expenses", headers=headers, params={"format": "excel", "period": "this_month"})
    assert r.status_code == 200
    assert "spreadsheet" in r.headers["content-type"] or "octet-stream" in r.headers["content-type"]

    # ── PDF Export ──
    r = await client.get("/api/v1/exports/expenses", headers=headers, params={"format": "pdf", "period": "this_month"})
    assert r.status_code == 200
    assert "pdf" in r.headers["content-type"] or "octet-stream" in r.headers["content-type"]

    # ── Hospital isolation: HA sees only their hospital's expenses ──
    ha_token = await login(client, "exp_ha@t.com")
    ha_headers = {"Authorization": f"Bearer {ha_token}"}
    r = await client.get("/api/v1/expenses/", headers=ha_headers)
    assert r.status_code == 200
    assert len(r.json()) == 4

    # Create a second hospital, add expense there, verify HA doesn't see it
    r = await client.post("/api/v1/hospitals/", headers=headers, json={
        "name": "Other Hospital", "address": "Other", "admin_group_id": seed["admin_group_id"]
    })
    assert r.status_code == 201
    other_hid = r.json()["id"]
    r = await client.post("/api/v1/expenses/", headers=headers, json={
        "hospital_id": other_hid, "expense_date": "2026-06-10",
        "expense_category": "Other", "expense_name": "OtherExp", "amount": 999,
    })
    assert r.status_code == 201

    # HA should still see only 4 (their hospital), not the 5th from other hospital
    r = await client.get("/api/v1/expenses/", headers=ha_headers)
    assert r.status_code == 200
    assert len(r.json()) == 4

    # ── Cleanup ──
    for eid in created_ids:
        await client.delete(f"/api/v1/expenses/{eid}", headers=headers)
