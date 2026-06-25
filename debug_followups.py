import httpx, random
c = httpx.Client(base_url='http://localhost:8000/api/v1', timeout=30, follow_redirects=True)
r = c.post('/auth/login', json={'email': 'superadmin@dental.com', 'password': 'SuperAdmin@123'})
token = r.json()['access_token']
c.headers.update({'Authorization': f'Bearer {token}'})

h_id = c.get('/hospitals/').json()[0]['id']
tts = {t['name']: t['id'] for t in c.get('/treatment-types').json()}
scaling_global_id = tts.get('Scaling')
print(f'Global Scaling TT ID: {scaling_global_id}')

# Create patient
p = c.post('/patients', json={'full_name': 'Debug Patient','phone': '9000000099','hospital_id': h_id,'date_of_birth': '1990-01-15','gender': 'MALE'}).json()
d = c.post('/doctors', json={'full_name': 'Dr Debug','email': f'dbg.{random.randint(10000,99999)}@t.com','phone': '8333333333','password': 'Doctor@123','hospital_id': h_id,'role': 'DOCTOR','specialization': 'General'}).json()
case = c.post('/cases', json={'patient_id':p['id'],'doctor_id':d['id'],'hospital_id':h_id,'diagnosis':'Test','chief_complaint':'Test','status':'OPEN'}).json()

# Create plan WITH treatment_type_id explicitly set to global Scaling ID
plan = c.post('/treatment-plans', json={
    'case_id': case['id'], 'treatment_name': 'Scaling',
    'treatment_type_id': scaling_global_id,
    'total_sittings': 1, 'cost': 3000.0, 'status': 'IN_PROGRESS',
}).json()
print(f'Plan: id={plan["id"]} type_id={plan.get("treatment_type_id")} name={plan.get("treatment_name")}')

# Complete sitting 1 (only sitting, plan completes)
s1 = c.post('/treatment-sittings', json={'treatment_plan_id':plan['id'],'sitting_number':1,'sitting_date':'2026-06-25','doctor_id':d['id'],'work_done':'S1','status':'PLANNED'}).json()
r = c.put(f'/treatment-sittings/{s1["id"]}', json={'status':'COMPLETED','work_done':'S1 done'})
print(f'Sitting 1 complete: status={r.status_code} body={r.text[:200]}')

# Check follow-ups
fus = c.get(f'/crm/treatment-follow-ups?patient_id={p["id"]}').json()
print(f'Follow-ups: {len(fus)}')
for fu in fus:
    print(f'  {fu["follow_up_type"]} | {fu["follow_up_date"]} | {fu["status"]}')

# Check recalls
recs = c.get(f'/crm/recalls?patient_id={p["id"]}').json()
print(f'Recalls: {len(recs)}')
for r in recs:
    print(f'  {r["follow_up_type"]} | {r["follow_up_date"]} | {r["status"]}')

# Check plan status
plan_r = c.get(f'/treatment-plans/{plan["id"]}').json()
print(f'Plan status: {plan_r["status"]} remaining={plan_r.get("remaining_sittings")}')
