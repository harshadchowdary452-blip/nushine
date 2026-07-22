import requests, json

BASE = "http://localhost:8000/api/v1"

# Login
r = requests.post(f"{BASE}/auth/login", json={"email": "superadmin@dental.com", "password": "SuperAdmin@123"})
print(f"Login status: {r.status_code}")
data = r.json()
token = data.get("access_token", "")
print(f"Token: {token[:20]}...")

headers = {"Authorization": f"Bearer {token}"}

# Test auth
r = requests.get(f"{BASE}/auth/me", headers=headers)
print(f"Me: {r.status_code} {r.json()}")

# Get hospitals
r = requests.get(f"{BASE}/hospitals", headers=headers)
print(f"Hospitals status: {r.status_code}")
if r.status_code == 200:
    hospitals = r.json()
    for h in hospitals:
        print(f"  Hospital: {h.get('id')} - {h.get('name')}")
