import httpx
c = httpx.Client(base_url='http://localhost:8000/api/v1', timeout=30, follow_redirects=True)
r = c.post('/auth/login', json={'email':'superadmin@dental.com','password':'SuperAdmin@123'})
c.headers.update({'Authorization': f'Bearer {r.json()["access_token"]}'})
r = c.get('/crm/settings/rules')
rules = r.json()
print(f"Rules count: {len(rules)}")
for rule in rules:
    print(f"  Rule: {rule['treatment_name']} | template_id={rule.get('treatment_template_id')} | 1d={rule['follow_up_1_day']} 7d={rule['follow_up_7_day']} 6m={rule['recall_6_month']} 12m={rule['recall_12_month']}")
