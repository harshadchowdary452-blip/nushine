"""drop duplicate TREATMENT_ONGOING patient status (alias of UNDER_TREATMENT)

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f0
Create Date: 2026-08-13 00:00:00.000000

TREATMENT_ONGOING and UNDER_TREATMENT mean the same thing and were shown as
duplicate options in the UI. The codebase only ever sets UNDER_TREATMENT
(see status_automation.update_patient_status). No rows currently use
TREATMENT_ONGOING, and only patients.status references the patientstatus
enum, so the type is recreated without the value.
"""
from typing import Union, Sequence
from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a1'
down_revision: Union[str, None] = 'a1b2c3d4e5f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Same order as the existing DB enum (migration a1b2c3d4e5f8 appended the
# later values), minus the removed duplicate.
_VALUES = ['NEW', 'ACTIVE', 'UNDER_TREATMENT', 'FOLLOW_UP', 'COMPLETED',
           'INACTIVE', 'OPD', 'LOST', 'ARCHIVED']


def _existing_values(bind):
    return {
        r[0] for r in
        bind.execute(sa.text("SELECT unnest(enum_range(NULL::patientstatus))")).all()
    }


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    if "TREATMENT_ONGOING" not in _existing_values(bind):
        return
    op.execute(
        "CREATE TYPE patientstatus_new AS ENUM "
        f"({', '.join(repr(v) for v in _VALUES)})"
    )
    op.execute(
        "ALTER TABLE patients ALTER COLUMN status "
        "TYPE patientstatus_new USING status::text::patientstatus_new"
    )
    op.execute("DROP TYPE patientstatus")
    op.execute("ALTER TYPE patientstatus_new RENAME TO patientstatus")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    if "TREATMENT_ONGOING" in _existing_values(bind):
        return
    op.execute("ALTER TYPE patientstatus ADD VALUE 'TREATMENT_ONGOING'")
