import httpx

c = httpx.Client(base_url='http://localhost:8000/api/v1', timeout=30, follow_redirects=True)
r = c.post('/auth/login', json={'email': 'superadmin@dental.com', 'password': 'SuperAdmin@123'})
token = r.json()['access_token']
c.headers.update({'Authorization': f'Bearer {token}'})

# All TreatmentTypes
tts = c.get('/treatment-types').json()
print(f"=== TreatmentTypes ({len(tts)}) ===")
for tt in tts:
    print(f"  id={tt['id']} name={tt['name']} hospital_id={tt.get('hospital_id')}")

# All CRM rules
rules = c.get('/crm/treatment-follow-up-rules').json()
print(f"\n=== CRM Rules ({len(rules)}) ===")
for rl in rules:
    print(f"  id={rl['id']} name={rl['treatment_name']} tt_id={rl.get('treatment_type_id')} template_id={rl.get('treatment_template_id')} hospital_id={rl.get('hospital_id')} enabled={rl['is_active']} enquiry={rl.get('enquiry_enabled')}")