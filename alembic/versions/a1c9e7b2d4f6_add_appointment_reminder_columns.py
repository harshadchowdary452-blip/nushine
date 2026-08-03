"""add appointment reminder dedup columns

Revision ID: a1c9e7b2d4f6
Revises: 3f9b7e2a5d1c
Create Date: 2026-08-03

Adds reminder_sent/reminded_at to appointments so the scheduler never re-sends
the same reminder across loop iterations or uvicorn workers (Part 4 audit C1).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1c9e7b2d4f6"
down_revision: Union[str, None] = "3f9b7e2a5d1c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "appointments",
        sa.Column("reminder_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "appointments",
        sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_appointments_reminded_at", "appointments", ["reminded_at"])


def downgrade() -> None:
    op.drop_index("ix_appointments_reminded_at", table_name="appointments")
    op.drop_column("appointments", "reminded_at")
    op.drop_column("appointments", "reminder_sent")
