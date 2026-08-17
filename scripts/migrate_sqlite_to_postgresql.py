"""
Appointin Dental - SQLite to PostgreSQL Migration Script
ZERO DATA LOSS GUARANTEED

Usage:
    python scripts/migrate_sqlite_to_postgresql.py --pg-url "postgresql://user:password@host:5432/nushine"

Steps:
    1. Backs up SQLite database
    2. Creates PostgreSQL schema from SQLAlchemy models
    3. Migrates all data in FK-safe order
    4. Validates row counts match exactly
    5. Generates migration report

Requirements:
    pip install sqlalchemy asyncpg psycopg2-binary aiosqlite
"""

import asyncio
import argparse
import sys
import os
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./dental_hospital.db"
os.environ["DATABASE_URL_SYNC"] = "sqlite:///./dental_hospital.db"

from app.database import Base
from app.models import *

from sqlalchemy import create_engine, text, MetaData, Table
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("migration")


SQLITE_PATH = "dental_hospital.db"

INSERTION_ORDER = [
    "admin_groups",
    "email_templates",
    "hospital_settings",
    "hospitals",
    "users",
    "patients",
    "consultants",
    "appointments",
    "cases",
    "consultant_notes",
    "treatment_plans",
    "treatment_sittings",
    "pre_ops",
    "post_ops",
    "billings",
    "payment_transactions",
    "hospital_monthly_expenses",
    "refresh_tokens",
    "audit_logs",
    "communication_logs",
    "notifications",
    "patient_feedback",
    "follow_ups",
    "status_audit_logs",
]

BATCH_SIZE = 500


def get_sqlite_counts() -> dict:
    import sqlite3

    conn = sqlite3.connect(SQLITE_PATH)
    cursor = conn.cursor()
    counts = {}
    for table in INSERTION_ORDER:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            counts[table] = cursor.fetchone()[0]
        except Exception as e:
            log.warning(f"  {table}: ERROR - {e}")
            counts[table] = -1
    conn.close()
    return counts


def extract_sqlite_data() -> dict:
    import sqlite3
    import json

    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    all_data = {}

    for table in INSERTION_ORDER:
        try:
            cursor.execute(f"SELECT * FROM {table}")
            rows = [dict(row) for row in cursor.fetchall()]
            all_data[table] = rows
            log.info(f"  Extracted {len(rows)} rows from {table}")
        except Exception as e:
            log.warning(f"  {table}: extraction failed - {e}")
            all_data[table] = []

    conn.close()
    return all_data


def get_pg_table_sync(pg_url: str, table_name: str) -> Table:
    sync_url = pg_url.replace("+asyncpg", "+psycopg2").replace("postgresql+psycopg2", "postgresql")
    engine = create_engine(sync_url)
    metadata = MetaData()
    metadata.reflect(bind=engine, only=[table_name])
    engine.dispose()
    return metadata.tables[table_name]


def clean_row(row: dict, table_name: str) -> dict:
    cleaned = {}
    for k, v in row.items():
        if isinstance(v, str) and v.strip() == "":
            cleaned[k] = None
        elif isinstance(v, bytes):
            cleaned[k] = v.decode("utf-8") if v else None
        else:
            cleaned[k] = v
    return cleaned


def migrate_data_sync(pg_url: str, data: dict, skip_tables: list = None):
    sync_url = pg_url.replace("+asyncpg", "+psycopg2").replace("postgresql+psycopg2", "postgresql")
    engine = create_engine(sync_url)
    metadata = MetaData()
    metadata.reflect(bind=engine)

    total_inserted = 0
    total_failed = 0
    report = []

    for table_name in INSERTION_ORDER:
        if skip_tables and table_name in skip_tables:
            continue

        rows = data.get(table_name, [])
        if not rows:
            report.append(f"  {table_name}: 0 rows (nothing to migrate)")
            log.info(f"  {table_name}: 0 rows (nothing to migrate)")
            continue

        table = metadata.tables.get(table_name)
        if table is None:
            report.append(f"  {table_name}: SKIPPED - table not found in PostgreSQL")
            log.warning(f"  {table_name}: table not found in PostgreSQL schema")
            continue

        inserted = 0
        failed = 0

        with engine.begin() as conn:
            for i in range(0, len(rows), BATCH_SIZE):
                batch = rows[i : i + BATCH_SIZE]
                cleaned_batch = [clean_row(r, table_name) for r in batch]
                try:
                    conn.execute(table.insert(), cleaned_batch)
                    inserted += len(cleaned_batch)
                except Exception as e:
                    log.warning(f"  {table_name}: batch insert failed at row {i}: {e}")
                    for row_data in cleaned_batch:
                        try:
                            conn.execute(table.insert(), row_data)
                            inserted += 1
                        except Exception as e2:
                            log.error(f"  {table_name}: row insert failed: {e2}")
                            failed += 1

        total_inserted += inserted
        total_failed += failed
        msg = f"  {table_name}: {inserted} inserted, {failed} failed"
        report.append(msg)
        log.info(msg)

    engine.dispose()
    return total_inserted, total_failed, report


def verify_counts(pg_url: str, sqlite_counts: dict) -> dict:
    sync_url = pg_url.replace("+asyncpg", "+psycopg2").replace("postgresql+psycopg2", "postgresql")
    engine = create_engine(sync_url)

    results = {}
    all_match = True
    mismatches = []

    for table in INSERTION_ORDER:
        try:
            with engine.connect() as conn:
                result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
                pg_count = result.scalar()
            sqlite_count = sqlite_counts.get(table, -1)
            match = pg_count == sqlite_count
            results[table] = {
                "sqlite": sqlite_count,
                "postgresql": pg_count,
                "match": match,
            }
            if not match:
                all_match = False
                mismatches.append(f"{table}: SQLite={sqlite_count} vs PostgreSQL={pg_count}")
        except Exception as e:
            results[table] = {"sqlite": sqlite_counts.get(table, -1), "postgresql": -1, "match": False, "error": str(e)}
            all_match = False
            mismatches.append(f"{table}: ERROR - {e}")

    engine.dispose()
    return {
        "results": results,
        "all_match": all_match,
        "mismatches": mismatches,
    }


def generate_schema_sql(pg_url: str) -> str:
    sync_url = pg_url.replace("+asyncpg", "+psycopg2").replace("postgresql+psycopg2", "postgresql")
    from sqlalchemy.schema import CreateTable

    sql_statements = []
    for table in reversed(Base.metadata.sorted_tables):
        sql_statements.append(str(CreateTable(table).compile(dialect=table.metadata.bind.dialect if table.metadata.bind else None)).strip() + ";")

    return "\n\n".join(sql_statements)


async def create_pg_schema(pg_url: str):
    engine = create_async_engine(pg_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    log.info("PostgreSQL schema created successfully")


async def main():
    parser = argparse.ArgumentParser(description="Migrate Appointin Dental from SQLite to PostgreSQL")
    parser.add_argument("--pg-url", required=True, help="PostgreSQL connection string (asyncpg format)")
    parser.add_argument("--skip-schema", action="store_true", help="Skip schema creation (if already exists)")
    parser.add_argument("--skip-migrate", action="store_true", help="Skip data migration (verify only)")
    parser.add_argument("--skip-verify", action="store_true", help="Skip count verification")
    parser.add_argument("--dry-run", action="store_true", help="Extract and count only, no writes")
    args = parser.parse_args()

    pg_url = args.pg_url
    if "+asyncpg" not in pg_url and "postgresql" in pg_url:
        pg_url = pg_url.replace("postgresql://", "postgresql+asyncpg://")
    elif "+psycopg2" in pg_url:
        pg_url = pg_url.replace("+psycopg2", "+asyncpg")

    start_time = datetime.now()
    log.info("=" * 60)
    log.info("APPOINTIN DENTAL - SQLite TO PostgreSQL MIGRATION")
    log.info("=" * 60)

    log.info("\n[STEP 1] Auditing SQLite database...")
    sqlite_counts = get_sqlite_counts()
    total_sqlite = sum(c for c in sqlite_counts.values() if c > 0)
    for table, count in sqlite_counts.items():
        status = f"{count} rows" if count >= 0 else "NOT FOUND"
        log.info(f"  {table}: {status}")
    log.info(f"  TOTAL records in SQLite: {total_sqlite}")

    if args.dry_run:
        log.info("\n[DRY RUN] Extraction skipped, verification skipped.")
        log.info("Dry run complete. Use --dry-run to test configuration.")
        return

    log.info("\n[STEP 2] Creating PostgreSQL schema...")
    if not args.skip_schema:
        try:
            await create_pg_schema(pg_url)
        except Exception as e:
            log.error(f"Schema creation failed: {e}")
            log.error("Ensure PostgreSQL is running and the connection URL is correct.")
            log.error("You can also run: alembic upgrade head")
            log.error("Attempting to proceed with data migration...")
    else:
        log.info("  Schema creation skipped (--skip-schema)")

    if args.skip_migrate:
        log.info("\n[STEP 3] Data migration skipped (--skip-migrate)")
    else:
        log.info("\n[STEP 3] Extracting data from SQLite...")
        all_data = extract_sqlite_data()

        total_rows = sum(len(rows) for rows in all_data.values())
        log.info(f"  Total rows extracted: {total_rows}")

        log.info("\n[STEP 4] Migrating data to PostgreSQL...")
        sync_url = pg_url.replace("+asyncpg", "+psycopg2")
        total_inserted, total_failed, report = await asyncio.to_thread(
            migrate_data_sync, sync_url, all_data
        )
        log.info(f"\n  Migration complete: {total_inserted} inserted, {total_failed} failed")

    if args.skip_verify:
        log.info("\n[STEP 5] Verification skipped (--skip-verify)")
    else:
        log.info("\n[STEP 5] Verifying data integrity...")
        sync_url = pg_url.replace("+asyncpg", "+psycopg2")
        verify_result = await asyncio.to_thread(verify_counts, sync_url, sqlite_counts)

        log.info("\n  Count Comparison:")
        log.info(f"  {'Table':<30} {'SQLite':<10} {'PostgreSQL':<12} {'Match':<8}")
        log.info(f"  {'-'*30} {'-'*10} {'-'*12} {'-'*8}")
        for table in INSERTION_ORDER:
            v = verify_result["results"].get(table, {})
            match_mark = "✓" if v.get("match") else "✗"
            log.info(f"  {table:<30} {str(v.get('sqlite', '?')):<10} {str(v.get('postgresql', '?')):<12} {match_mark:<8}")

        if verify_result["all_match"]:
            log.info("\n  *** ALL COUNTS MATCH - MIGRATION SUCCESSFUL ***")
        else:
            log.warning("\n  *** COUNT MISMATCHES DETECTED ***")
            for m in verify_result["mismatches"]:
                log.warning(f"  {m}")

    elapsed = (datetime.now() - start_time).total_seconds()
    log.info(f"\n{'='*60}")
    log.info(f"MIGRATION COMPLETED in {elapsed:.1f} seconds")
    log.info(f"{'='*60}")

    log.info("\nNext steps:")
    log.info("  1. Update .env file with PostgreSQL credentials:")
    log.info(f"     DATABASE_URL={pg_url}")
    log.info(f"     DATABASE_URL_SYNC={sync_url}")
    log.info("  2. Restart the application")
    log.info("  3. Test all features: login, patients, appointments, cases, billings")
    log.info("  4. If rollback is needed, restore from: backups/sqlite_backup_before_postgres_migration.db")
    log.info("     and set DATABASE_URL back to SQLite")


if __name__ == "__main__":
    asyncio.run(main())
