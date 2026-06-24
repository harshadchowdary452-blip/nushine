"""Start server, run test focusing on dashboard metrics"""
import subprocess, sys, time, urllib.request, httpx
from pathlib import Path

venv = Path("venv/Scripts/python.exe").resolve()

proc = subprocess.Popen(
    [str(venv), "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
)
for i in range(30):
    try:
        urllib.request.urlopen("http://localhost:8000/docs", timeout=2)
        break
    except:
        time.sleep(1)
else:
    print("Server failed to start")
    sys.exit(1)

print("Server ready")

client = httpx.Client(base_url='http://localhost:8000/api/v1', timeout=30, follow_redirects=True)
r = client.post('/auth/login', json={'email':'superadmin@dental.com','password':'SuperAdmin@123'})
client.headers.update({'Authorization': 'Bearer ' + r.json()['access_token']})

# Check main dashboard metrics
r = client.get('/crm/dashboard')
if r.status_code == 200:
    d = r.json()
    m = d.get('metrics', {})
    print()
    print("=== CRM Dashboard Metrics ===")
    print("  total_follow_ups (treatment only):", m.get('total_follow_ups'))
    print("  total_recalls:", m.get('total_recalls'))
    print("  pending_follow_ups:", m.get('pending_follow_ups'))
    print("  pending_recalls:", m.get('pending_recalls'))
    print("  completed_follow_ups:", m.get('completed_follow_ups'))
    print("  completed_recalls:", m.get('completed_recalls'))
    print("  overdue_follow_ups:", m.get('overdue_follow_ups'))
    print("  overdue_recalls:", m.get('overdue_recalls'))
    print("  1-day due:", m.get('one_day_follow_ups_due'))
    print("  6-month recalls due:", m.get('six_month_recalls_due'))
    print("  12-month recalls due:", m.get('twelve_month_recalls_due'))
else:
    print("Dashboard failed:", r.status_code, r.text[:200])

# Check recall list works now
r = client.get('/crm/recalls')
print()
print("=== Recall List ===")
print("  Count:", len(r.json()) if r.status_code == 200 else 'ERR')
if r.status_code == 200:
    for rec in r.json()[:5]:
        print("  ", rec.get('follow_up_type'), '|', rec.get('patient_name'), '|', rec.get('follow_up_date'))

proc.terminate()
try:
    proc.wait(timeout=5)
except:
    proc.kill()
