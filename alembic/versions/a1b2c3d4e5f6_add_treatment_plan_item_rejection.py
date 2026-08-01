"""add treatment_plan_item rejection fields

Revision ID: a1b2c3d4e5f6
Revises: e1f2a3b4c5d7
Create Date: 2026-07-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e5f6"
down_revision = "e1f2a3b4c5d7"
branch_labels = None
depends_on = None


def column_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    return column in [c["name"] for c in inspector.get_columns(table)]


def upgrade() -> None:
    if not column_exists("treatment_plan_items", "is_rejected"):
        op.add_column("treatment_plan_items", sa.Column("is_rejected", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    if not column_exists("treatment_plan_items", "rejected_by_id"):
        op.add_column("treatment_plan_items", sa.Column("rejected_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True))
    if not column_exists("treatment_plan_items", "rejected_at"):
        op.add_column("treatment_plan_items", sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True))
    if not column_exists("treatment_plan_items", "rejection_reason"):
        op.add_column("treatment_plan_items", sa.Column("rejection_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    for column in ("rejection_reason", "rejected_at", "rejected_by_id", "is_rejected"):
        if column_exists("treatment_plan_items", column):
            op.drop_column("treatment_plan_items", column)
