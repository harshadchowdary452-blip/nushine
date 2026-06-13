"""add follow_up_response columns

Revision ID: ac30119a2a87
Revises: e1f2a3b4c5d6
Create Date: 2026-06-13 18:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "ac30119a2a87"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)

    # Add columns to follow_up_responses
    existing = [c["name"] for c in inspector.get_columns("follow_up_responses")]
    if "feedback" not in existing:
        op.add_column("follow_up_responses", sa.Column("feedback", sa.String(20), nullable=True))
    if "follow_up_required" not in existing:
        op.add_column("follow_up_responses", sa.Column("follow_up_required", sa.Boolean(), nullable=True, server_default=sa.text("0")))
    if "appointment_id" not in existing:
        op.add_column("follow_up_responses", sa.Column("appointment_id", sa.String(36), nullable=True))
    if "created_by" not in existing:
        op.add_column("follow_up_responses", sa.Column("created_by", sa.String(36), nullable=True))


def downgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    existing = [c["name"] for c in inspector.get_columns("follow_up_responses")]
    for col in ("feedback", "follow_up_required", "appointment_id", "created_by"):
        if col in existing:
            op.drop_column("follow_up_responses", col)
