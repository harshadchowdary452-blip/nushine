"""Debug: check rule state and test on_sitting_completed fix"""
import httpx, json, os

c = httpx.Client(base_url='http://localhost:8000/api/v1', timeout=10, follow_redirects=True)
r = c.post('/auth/login', json={'email':'superadmin@dental.com','password':'SuperAdmin@123'})
c.headers.update({'Authorization': 'Bearer ' + r.json()['access_token']})

# Check all follow-ups
r = c.get('/crm/treatment-follow-ups')
fus = r.json()
print(f'Total follow-ups: {len(fus)}')
types = {}
for fu in fus:
    types[fu['follow_up_type']] = types.get(fu['follow_up_type'], 0) + 1
print('By type:', json.dumps(types))

# Check rules
r = c.get('/crm/settings/rules')
rules = r.json()
print(f'Rules: {len(rules)}')
for rule in rules:
    print(f'  Rule: {rule["treatment_name"]} | active={rule["is_active"]}')

# Check file modification time
mtime = os.path.getmtime('app/services/treatment_enquiry_service.py')
from datetime import datetime
print(f'File modified: {datetime.fromtimestamp(mtime)}')
