import requests, json

r = requests.post('http://localhost:8000/api/v1/auth/login', json={'email':'admin@nushine.com','password':'admin123'})
token = r.json()['access_token']
print('Token OK:', token[:20])

r2 = requests.get('http://localhost:8000/api/v1/users', headers={'Authorization': f'Bearer {token}'})
users = r2.json()
for u in users:
    if u.get('role') == 'DOCTOR':
        print(f"Doctor: {u['id']} | {u.get('full_name','?')}")
        doctor_id = u['id']
        r3 = requests.get(f'http://localhost:8000/api/v1/appointments/slots?doctor_id={doctor_id}&date=2026-06-20&duration_minutes=30', headers={'Authorization': f'Bearer {token}'})
        print(f"Slots status: {r3.status_code}")
        if r3.status_code == 200:
            data = r3.json()
            print(f"Response keys: {list(data.keys())}")
            slots = data.get('slots', data.get('time_slots', []))
            print(f"Num slots: {len(slots)}")
            for s in slots[:5]:
                print(f"  {s.get('time','?')} available={s.get('available')} status={s.get('status','?')}")
            if len(slots) > 5:
                print(f"  ... and {len(slots)-5} more")
        else:
            print(f"Error: {r3.text[:1000]}")
        break
