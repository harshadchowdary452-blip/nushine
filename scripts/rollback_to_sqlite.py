"""
NuShine Dental - Rollback from PostgreSQL to SQLite

Restores the SQLite backup and reverts configuration.
Run this if PostgreSQL migration has issues.

Usage:
    python scripts/rollback_to_sqlite.py
"""

import shutil
from pathlib import Path

BACKUP_PATH = Path("backups/sqlite_backup_before_postgres_migration.db")
SQLITE_PATH = Path("dental_hospital.db")


def main():
    if not BACKUP_PATH.exists():
        print(f"ERROR: Backup not found at {BACKUP_PATH}")
        print("Cannot rollback without a backup.")
        return

    if not SQLITE_PATH.exists():
        print(f"WARNING: Current SQLite DB not found at {SQLITE_PATH}")
        print("Restoring backup as new SQLite DB...")
    else:
        print(f"Backing up current SQLite DB (if exists)...")
        backup_of_backup = Path(f"backups/sqlite_before_rollback_{__import__('datetime').datetime.now().strftime('%Y%m%d_%H%M%S')}.db")
        shutil.copy2(SQLITE_PATH, backup_of_backup)
        print(f"  Saved to: {backup_of_backup}")

    shutil.copy2(BACKUP_PATH, SQLITE_PATH)
    print(f"  Restored: {BACKUP_PATH} -> {SQLITE_PATH}")

    print("\n=== ROLLBACK COMPLETE ===")
    print("\nNow update your .env file to use SQLite:")
    print("  DATABASE_URL=sqlite+aiosqlite:///./dental_hospital.db")
    print("  DATABASE_URL_SYNC=sqlite:///./dental_hospital.db")
    print("\nThen restart the application.")


if __name__ == "__main__":
    main()
