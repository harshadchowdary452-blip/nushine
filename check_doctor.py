import psycopg2
conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/nushine")
cur = conn.cursor()
# Check if crm_enabled exists
cur.execute("SELECT * FROM crm_configs WHERE hospital_id = 'fadd20f4-4173-423c-bfb0-a45d5435bc56' AND config_key = 'crm_enabled'")
row = cur.fetchone()
print(f"crm_enabled config: {row}")

# Check follow_up_configs
cur.execute("SELECT context_type, treatment_type_id, enabled, start_delay_days FROM crm_follow_up_configs WHERE hospital_id = 'fadd20f4-4173-423c-bfb0-a45d5435bc56'")
rows = cur.fetchall()
print(f"Follow-up configs: {len(rows)}")
for row in rows:
    print(f"  {row}")

# Check the crm_enabled key for the other hospital  
cur.execute("SELECT * FROM crm_configs WHERE hospital_id = '2e0920f1-be0d-4cf0-a2f5-e103397c623f' AND config_key = 'crm_enabled'")
row2 = cur.fetchone()
print(f"\nOther hospital crm_enabled: {row2}")

cur.close()
conn.close()
