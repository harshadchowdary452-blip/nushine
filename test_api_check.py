import requests

BASE = "http://localhost:8000/api/v1"
r = requests.post(f"{BASE}/auth/login", json={"email": "superadmin@dental.com", "password": "SuperAdmin@123"}, timeout=10)
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}

# Check lead rules
r2 = requests.get(f"{BASE}/crm/rules/lead", headers=H, timeout=10)
print("Lead rules:", r2.json())

# Check treatment rules
r3 = requests.get(f"{BASE}/crm/rules/treatment", headers=H, timeout=10)
print("Treatment rules:", r3.json())
