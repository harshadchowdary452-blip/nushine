import sqlite3
conn = sqlite3.connect("C:\\Users\\harsh\\fastapi-project\\dental_hospital.db")
cursor = conn.cursor()
cursor.execute("SELECT version_num FROM alembic_version")
versions = [r[0] for r in cursor.fetchall()]
print("Current versions:", versions)

# Add our migration
cursor.execute("INSERT INTO alembic_version (version_num) VALUES ('210f57adcad3')")
conn.commit()

cursor.execute("SELECT version_num FROM alembic_version")
versions = [r[0] for r in cursor.fetchall()]
print("Updated versions:", versions)
conn.close()
