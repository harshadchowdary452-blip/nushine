import requests, json
from datetime import date, timedelta

BASE = "http://localhost:8000/api/v1"

login = requests.post(f"{BASE}/auth/login", json={"email": "superadmin@dental.com", "password": "SuperAdmin@123"}, timeout=10)
token = login.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

start = date.today().isoformat()
end = (date.today() + timedelta(days=90)).isoformat()

# Test enriched calendar
r = requests.get(f"{BASE}/crm/enquiries/calendar?start_date={start}&end_date={end}", headers=headers, timeout=10)
print(f"Calendar Status: {r.status_code}")
if r.status_code == 200:
    data = r.json()
    items = data["items"]
    print(f"Total items: {data['total']}")
    if items:
        item = items[0]
        print(f"\nKeys: {list(item.keys())}")
        print(f"Description: {item.get('description', 'N/A')}")
        print(f"Patient: {item.get('patient', {}).get('name') if item.get('patient') else 'None'}")
        print(f"Doctor: {item.get('doctor', {}).get('name') if item.get('doctor') else 'None'}")
        print(f"Hospital: {item.get('hospital', {}).get('name') if item.get('hospital') else 'None'}")
        print(f"Template vars count: {len(item.get('template_variables', {}))}")
        tv = item.get("template_variables", {})
        if tv:
            print(f"Template vars keys: {list(tv.keys())}")

        # Test enriched detail
        detail = requests.get(f"{BASE}/crm/enquiries/{item['id']}/detail", headers=headers, timeout=10)
        if detail.status_code == 200:
            dd = detail.json()
            print(f"\nDetail keys: {list(dd.keys())}")
            print(f"Comm history: {len(dd.get('communication_history', []))} items")
            print(f"Timeline: {len(dd.get('timeline', []))} items")

        # Test WhatsApp preview
        wp = requests.post(f"{BASE}/crm/enquiries/{item['id']}/whatsapp-preview", json={}, headers=headers, timeout=10)
        if wp.status_code == 200:
            wpd = wp.json()
            print(f"\nWhatsApp Preview:")
            print(f"  Valid: {wpd.get('is_valid')}")
            print(f"  Resolved vars: {len(wpd.get('resolved_variables', {}))}")
            print(f"  Unresolved: {wpd.get('unresolved_variables', [])}")
            msg = wpd.get("rendered_message", "")
            print(f"  Rendered message: {msg[:100]}...")
        else:
            print(f"\nWhatsApp Preview error: {wp.status_code} {wp.text[:200]}")
    else:
        print("No items found in date range")
else:
    print(f"Error: {r.text[:300]}")
