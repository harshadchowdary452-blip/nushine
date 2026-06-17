import asyncio, asyncpg
import bcrypt

async def main():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/nushine')
    rows = await conn.fetch("SELECT email, password_hash FROM users")
    
    common_pws = ["password", "password123", "admin", "admin123", "123456", "test", "test123", "doctor123", "Nushine123", "nushine"]
    
    for r in rows:
        if r['password_hash'] == 'MIGRATED_PLACEHOLDER':
            continue
        for pw in common_pws:
            try:
                if bcrypt.checkpw(pw.encode('utf-8'), r['password_hash'].encode('utf-8')):
                    print(f"MATCH: {r['email']} -> {pw}")
                    break
            except:
                pass
    await conn.close()

asyncio.run(main())
