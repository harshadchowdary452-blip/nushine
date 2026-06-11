import sqlite3
conn = sqlite3.connect("C:\\Users\\harsh\\fastapi-project\\dental_hospital.db")
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = cursor.fetchall()
print("Tables:", [t[0] for t in tables])
for t in tables:
    print(f"\n=== {t[0]} ===")
    cursor.execute(f"PRAGMA table_info({t[0]})")
    cols = cursor.fetchall()
    for c in cols:
        print(f"  {c[1]} ({c[2]}) nullable={not c[3]} default={c[4]}")
conn.close()
