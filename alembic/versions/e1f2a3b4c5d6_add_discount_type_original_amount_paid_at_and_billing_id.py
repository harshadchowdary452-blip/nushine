"""Add discount_type, original_amount, paid_at to billings; billing_id to follow_ups

Revision ID: e1f2a3b4c5d6
Revises: a7b8c9d0e1f2
Create Date: 2026-06-13 18:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "e1f2a3b4c5d6"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def has_column(table, column):
    conn = op.get_bind()
    insp = sa.inspect(conn)
    columns = [c["name"] for c in insp.get_columns(table)]
    return column in columns


def upgrade():
    # --- billings ---
    if not has_column("billings", "original_amount"):
        op.add_column("billings", sa.Column("original_amount", sa.Float(), nullable=True))
    if not has_column("billings", "discount_type"):
        op.add_column("billings", sa.Column("discount_type", sa.String(20), nullable=True))
    if not has_column("billings", "paid_at"):
        op.add_column("billings", sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True))

    # Backfill original_amount for existing records: original_amount = total_amount + discount_amount
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE billings SET original_amount = COALESCE(total_amount, 0) + COALESCE(discount_amount, 0) "
            "WHERE original_amount IS NULL"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE billings SET discount_type = 'PERCENTAGE' WHERE discount_type IS NULL"
        )
    )
    # Make columns non-nullable after backfill
    conn.execute(
        sa.text("PRAGMA table_info(billings)")
    )
    # SQLite doesn't support ALTER COLUMN, so we just leave them nullable for SQLite
    # They will be non-nullable from the app level

    # --- follow_ups ---
    if not has_column("follow_ups", "billing_id"):
        op.add_column("follow_ups", sa.Column("billing_id", sa.String(36), nullable=True))


def downgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)
    columns = [c["name"] for c in insp.get_columns("billings")]
    for col in ("original_amount", "discount_type", "paid_at"):
        if col in columns:
            op.drop_column("billings", col)
    fu_cols = [c["name"] for c in insp.get_columns("follow_ups")]
    if "billing_id" in fu_cols:
        op.drop_column("follow_ups", "billing_id")
