"""add patient type and guardian fields to patients

Revision ID: e3f4a5b6c7d1
Revises: e3f4a5b6c7d0
Create Date: 2026-08-02 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op


revision: str = 'e3f4a5b6c7d1'
down_revision: Union[str, None] = 'e3f4a5b6c7d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent so the migration is safe on DBs where the columns were
    # already created (e.g. a manual ALTER applied while diagnosing a 500).
    op.execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS patient_type VARCHAR(20) NOT NULL DEFAULT 'ADULT'")
    op.execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(255)")
    op.execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS guardian_relationship VARCHAR(100)")
    op.execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(50)")


def downgrade() -> None:
    op.execute("ALTER TABLE patients DROP COLUMN IF EXISTS guardian_phone")
    op.execute("ALTER TABLE patients DROP COLUMN IF EXISTS guardian_relationship")
    op.execute("ALTER TABLE patients DROP COLUMN IF EXISTS guardian_name")
    op.execute("ALTER TABLE patients DROP COLUMN IF EXISTS patient_type")
