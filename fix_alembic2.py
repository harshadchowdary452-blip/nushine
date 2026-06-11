import sqlite3
conn = sqlite3.connect("C:\\Users\\harsh\\fastapi-project\\dental_hospital.db")
cursor = conn.cursor()
# Keep only the latest version
cursor.execute("DELETE FROM alembic_version")
cursor.execute("INSERT INTO alembic_version (version_num) VALUES ('210f57adcad3')")
conn.commit()
cursor.execute("SELECT version_num FROM alembic_version")
print("Fixed versions:", [r[0] for r in cursor.fetchall()])
conn.close()
