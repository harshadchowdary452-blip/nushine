# NuShine Dental - SQLite to PostgreSQL Migration Guide

## Overview

Migrate NuShine Dental from SQLite (`dental_hospital.db`) to PostgreSQL with **zero data loss**.

**Total Tables:** 24  
**Estimated Records:** ~960 (admin_groups=1, hospitals=2, users=9, patients=10, cases=5, billings=5, payment_transactions=9, audit_logs=608, refresh_tokens=256, notifications=36, communication_logs=14, etc.)

---

## Prerequisites

- PostgreSQL 14+ installed and running
- Python 3.11+
- Access to create databases

---

## Quick Start

### 1. Install dependencies

```bash
pip install asyncpg psycopg2-binary
```

### 2. Create PostgreSQL database

```bash
# Local PostgreSQL
createdb nushine

# Or via psql
psql -U postgres -c "CREATE DATABASE nushine;"
```

### 3. Backup SQLite (automatic, but verify)

```bash
# Backup already created at:
ls -la backups/sqlite_backup_before_postgres_migration.db
```

### 4. Run migration

```bash
# Full migration (schema + data + verify)
python scripts/migrate_sqlite_to_postgresql.py \
  --pg-url "postgresql+asyncpg://postgres:postgres@localhost:5432/nushine"

# OR step by step:

# Step A: Create schema only
python scripts/migrate_sqlite_to_postgresql.py \
  --pg-url "postgresql+asyncpg://postgres:postgres@localhost:5432/nushine" \
  --skip-migrate

# Step B: Migrate data only (schema already exists)
python scripts/migrate_sqlite_to_postgresql.py \
  --pg-url "postgresql+asyncpg://postgres:postgres@localhost:5432/nushine" \
  --skip-schema

# Step C: Verify counts only
python scripts/migrate_sqlite_to_postgresql.py \
  --pg-url "postgresql+asyncpg://postgres:postgres@localhost:5432/nushine" \
  --skip-schema --skip-migrate
```

### 5. Update .env

```env
# PostgreSQL (production)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/nushine
DATABASE_URL_SYNC=postgresql://postgres:postgres@localhost:5432/nushine
```

### 6. Restart the application

```bash
# Stop current server, then:
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Migration Script Reference

### `scripts/migrate_sqlite_to_postgresql.py`

| Argument | Default | Description |
|----------|---------|-------------|
| `--pg-url` | (required) | PostgreSQL connection string (asyncpg format) |
| `--skip-schema` | false | Skip schema creation (if already exists) |
| `--skip-migrate` | false | Skip data migration (verify only) |
| `--skip-verify` | false | Skip count verification |
| `--dry-run` | false | Extract and count only, no writes |

### Examples

```bash
# Dry run - test connectivity and see counts
python scripts/migrate_sqlite_to_postgresql.py \
  --pg-url "postgresql+asyncpg://postgres:postgres@localhost:5432/nushine" \
  --dry-run

# Schema-only (for manual inspection)
python scripts/migrate_sqlite_to_postgresql.py \
  --pg-url "postgresql+asyncpg://postgres:postgres@localhost:5432/nushine" \
  --skip-migrate --skip-verify

# Verify existing migration
python scripts/migrate_sqlite_to_postgresql.py \
  --pg-url "postgresql+asyncpg://postgres:postgres@localhost:5432/nushine" \
  --skip-schema --skip-migrate
```

---

## Table Insertion Order (FK-safe)

The migration script inserts data in this order to respect foreign key constraints:

| Order | Table | FK References |
|-------|-------|---------------|
| 1 | `admin_groups` | (none) |
| 2 | `email_templates` | (none) |
| 3 | `hospital_settings` | (none) |
| 4 | `hospitals` | admin_groups |
| 5 | `users` | hospitals, admin_groups |
| 6 | `patients` | hospitals, users |
| 7 | `consultants` | hospitals |
| 8 | `appointments` | patients, users |
| 9 | `cases` | patients, users, consultants, appointments |
| 10 | `consultant_notes` | cases, consultants |
| 11 | `treatment_plans` | cases |
| 12 | `treatment_sittings` | treatment_plans |
| 13 | `pre_ops` | cases |
| 14 | `post_ops` | cases |
| 15 | `billings` | cases |
| 16 | `payment_transactions` | billings |
| 17 | `hospital_monthly_expenses` | hospitals, users |
| 18 | `refresh_tokens` | users |
| 19 | `audit_logs` | users |
| 20 | `communication_logs` | patients, hospitals, users |
| 21 | `notifications` | users, hospitals |
| 22 | `patient_feedback` | patients, hospitals, users, cases |
| 23 | `follow_ups` | patients, hospitals, users, cases, appointments |
| 24 | `status_audit_logs` | users |

---

## Schema Details

All 24 tables with 36+ foreign key relationships:

```
admin_groups (1)
  └─ hospitals (2) ── consultants (0)
  │   └─ users (9) ── patients (10)
  │                    └─ appointments (2)
  │                    └─ cases (5)
  │                        ├─ consultant_notes (0)
  │                        ├─ treatment_plans (1)
  │                        │   └─ treatment_sittings (1)
  │                        ├─ pre_ops (3)
  │                        ├─ post_ops (1)
  │                        ├─ billings (5)
  │                        │   └─ payment_transactions (9)
  │                        └─ patient_feedback (0)
  ├─ hospital_monthly_expenses (4)
  ├─ communication_logs (14)
  ├─ notifications (36)
  └─ follow_ups (1)

refresh_tokens (256)
audit_logs (608)
status_audit_logs (10)
email_templates (0)
hospital_settings (0)
```

Schema SQL generated at: `scripts/postgresql_schema.sql`

---

## Count Verification

After migration, the script automatically compares row counts:

```
Table                          SQLite     PostgreSQL  Match
------------------------------ ---------- ----------- -------
admin_groups                   1          1           ✓
hospitals                      2          2           ✓
users                          9          9           ✓
patients                       10         10          ✓
cases                          5          5           ✓
billings                       5          5           ✓
payment_transactions           9          9           ✓
audit_logs                     608        608         ✓
...                            ...        ...         ...
```

All 24 tables must show ✓ for a successful migration.

---

## Files Modified for Migration

| File | Change |
|------|--------|
| `app/config.py` | Added `DB_IS_POSTGRESQL`, `DB_IS_SQLITE`, `DB_DRIVER`, `SYNC_DATABASE_URL` properties |
| `app/database.py` | PostgreSQL pool settings (`pool_pre_ping=True`, `pool_recycle=3600`) |
| `app/main.py` | Use `settings.SYNC_DATABASE_URL` instead of `DATABASE_URL_SYNC` |
| `alembic/env.py` | Use `settings.SYNC_DATABASE_URL`, `create_engine` instead of `engine_from_config`, added `compare_type=True` |
| `alembic/alembic.ini` | Comment about runtime override |
| `app/models/hospital_settings.py` | Converted to new-style `Mapped`/`mapped_column` syntax with UUID default |
| `app/models/__init__.py` | Added `HospitalSettings`, `StatusAuditLog` imports |
| `requirements.txt` | Added `asyncpg>=0.30.0`, `psycopg2-binary>=2.9.0` |
| `.env.example` | Added PostgreSQL example config |

### New Files

| File | Purpose |
|------|---------|
| `scripts/migrate_sqlite_to_postgresql.py` | Main migration script (schema + data + verify) |
| `scripts/rollback_to_sqlite.py` | Emergency rollback to SQLite |
| `scripts/generate_pg_schema.py` | Generate PostgreSQL schema SQL |
| `scripts/postgresql_schema.sql` | Generated schema reference |
| `backups/sqlite_backup_before_postgres_migration.db` | SQLite backup |

---

## Rollback Plan

### If migration fails:

```bash
# 1. Restore SQLite backup
python scripts/rollback_to_sqlite.py

# 2. Revert .env to SQLite
# DATABASE_URL=sqlite+aiosqlite:///./dental_hospital.db
# DATABASE_URL_SYNC=sqlite:///./dental_hospital.db

# 3. Restart application
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### If application has issues with PostgreSQL:

```bash
# 1. Check PostgreSQL connection
psql -U postgres -d nushine -c "SELECT COUNT(*) FROM users;"

# 2. Check logs for errors
# Look for: sqlalchemy.exc.OperationalError, connection refused, etc.

# 3. If problematic, run rollback
python scripts/rollback_to_sqlite.py
```

---

## Supported PostgreSQL Providers

| Provider | Connection String Format |
|----------|------------------------|
| Local | `postgresql+asyncpg://postgres:postgres@localhost:5432/nushine` |
| Railway | `postgresql+asyncpg://user:pass@${RAILWAY_TCP_PROXY_DOMAIN}:${RAILWAY_TCP_PROXY_PORT}/railway` |
| Azure | `postgresql+asyncpg://user@host:password@host.postgres.database.azure.com:5432/nushine` |
| Render | `postgresql+asyncpg://user:pass@host.render.com:5432/nushine` |
| Neon | `postgresql+asyncpg://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require` |
| Supabase | `postgresql+asyncpg://postgres:pass@db.xxx.supabase.co:5432/postgres` |

**Note:** Replace `+asyncpg` with `+psycopg2` for `DATABASE_URL_SYNC` (or just use `postgresql://` prefix).

---

## Performance Indexes

After migration, consider adding these indexes for production performance:

```sql
CREATE INDEX IF NOT EXISTS idx_patients_hospital ON patients(hospital_id);
CREATE INDEX IF NOT EXISTS idx_patients_doctor ON patients(doctor_id);
CREATE INDEX IF NOT EXISTS idx_cases_patient ON cases(patient_id);
CREATE INDEX IF NOT EXISTS idx_cases_doctor ON cases(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_billings_case ON billings(case_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_billing ON payment_transactions(billing_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_follow_ups_date ON follow_ups(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_communication_logs_patient ON communication_logs(patient_id);
```

---

## Alembic After Migration

After switching to PostgreSQL, Alembic will work normally:

```bash
# Alembic reads SYNC_DATABASE_URL from settings automatically
alembic upgrade head

# Generate new migrations
alembic revision --autogenerate -m "description"
```

The `alembic/env.py` has been updated to use `settings.SYNC_DATABASE_URL` which resolves to the PostgreSQL sync URL.

---

## Validation Checklist

- [ ] All SQLite data backed up
- [ ] PostgreSQL database created
- [ ] Schema created (24 tables)
- [ ] All data migrated
- [ ] Row counts match exactly
- [ ] .env updated with PostgreSQL credentials
- [ ] Application restarts successfully
- [ ] Login works
- [ ] Patient CRUD works
- [ ] Appointment CRUD works
- [ ] Case CRUD works
- [ ] Treatment CRUD works
- [ ] Billing works
- [ ] Dashboard loads
- [ ] Reports generate
- [ ] Rollback script available
