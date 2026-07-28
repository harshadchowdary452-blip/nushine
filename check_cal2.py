import psycopg2
conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
cur = conn.cursor()
# Check if doctor exists
cur.execute("SELECT id, full_name FROM users WHERE id = 'edc06c83-adb3-4df9-85b9-78e228f6502f'")
print("Doctor edc06c83:", cur.fetchone())
# Also check the test hospital superadmin
cur.execute("SELECT id, email, hospital_id FROM users WHERE email = 'superadmin@dental.com'")
print("Superadmin:", cur.fetchone())
cur.close()
conn.close()
