import requests

BASE = "http://localhost:8000/api/v1"

# Try both password possibilities
for pw in ["CHANGE-ME-IN-PRODUCTION", "SuperAdmin@123"]:
    r = requests.post(f"{BASE}/auth/login", json={"email": "superadmin@dental.com", "password": pw}, timeout=10)
    if r.status_code == 200:
        print(f"LOGIN OK with password: {pw}")
        print(f"Token: {r.json()['access_token'][:50]}...")
        break
    else:
        print(f"Login failed with '{pw}': {r.status_code} {r.json()}")
