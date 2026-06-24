"""Test recall/list endpoints directly"""
import subprocess, sys, time, urllib.request
import httpx

# Start server
proc = subprocess.Popen(
    [sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000'],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
)
for i in range(20):
    try:
        urllib.request.urlopen('http://localhost:8000/docs', timeout=2)
        break
    except:
        time.sleep(1)
print('Server ready')

client = httpx.Client(base_url='http://localhost:8000/api/v1', timeout=10, follow_redirects=True)
r = client.post('/auth/login', json={'email':'superadmin@dental.com','password':'SuperAdmin@123'})
client.headers.update({'Authorization': 'Bearer ' + r.json()['access_token']})

# Test recall list
r = client.get('/crm/recalls')
print('Recall list status:', r.status_code)
try:
    data = r.json()
    print('  type:', type(data).__name__)
    if isinstance(data, list):
        print('  count:', len(data))
        for d in data:
            print('  -', d.get('id','?'), d.get('follow_up_type','?'), d.get('status','?'), d.get('patient_name','?'))
    else:
        print('  keys:', list(data.keys())[:5])
except Exception as e:
    print('  Error:', e)
    print('  Body:', r.text[:300])

# Test recall calendar
r = client.get('/crm/recalls/calendar?start_date=2026-01-01&end_date=2027-12-31')
print('Recall calendar count:', len(r.json()) if r.status_code == 200 else 'ERR')

# Test follow-ups
r = client.get('/crm/treatment-follow-ups')
print('Follow-ups count:', len(r.json()) if r.status_code == 200 else 'ERR')

proc.terminate()
proc.wait(timeout=5)
