"""add billing items and financial summary columns

Revision ID: b6a9c8d7e6f5
Revises: a1c9e7b2d4f6
Create Date: 2026-08-03

Enterprise billing workflow: adds a billing_items line-item table so invoices
can reference treatment plans/visits, and adds synced financial-summary columns
to cases and treatment_sittings (billing is the single source of truth).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b6a9c8d7e6f5"
down_revision: Union[str, None] = "a1c9e7b2d4f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "billing_items",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("billing_id", sa.String(length=36), sa.ForeignKey("billings.id"), nullable=False),
        sa.Column("treatment_plan_id", sa.String(length=36), sa.ForeignKey("treatment_plans.id"), nullable=True),
        sa.Column("treatment_sitting_id", sa.String(length=36), sa.ForeignKey("treatment_sittings.id"), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("discount_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("net_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("paid_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pending_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_billing_items_billing_id", "billing_items", ["billing_id"])
    op.create_index("ix_billing_items_treatment_plan_id", "billing_items", ["treatment_plan_id"])
    op.create_index("ix_billing_items_treatment_sitting_id", "billing_items", ["treatment_sitting_id"])

    op.add_column("cases", sa.Column("estimated_cost", sa.Float(), nullable=True))
    op.add_column("cases", sa.Column("total_billed", sa.Float(), nullable=False, server_default="0"))
    op.add_column("cases", sa.Column("total_paid", sa.Float(), nullable=False, server_default="0"))
    op.add_column("cases", sa.Column("outstanding_balance", sa.Float(), nullable=False, server_default="0"))
    op.add_column("cases", sa.Column("payment_status", sa.String(length=20), nullable=True))

    op.add_column("treatment_sittings", sa.Column("charge", sa.Float(), nullable=True))
    op.add_column("treatment_sittings", sa.Column("paid_amount", sa.Float(), nullable=False, server_default="0"))
    op.add_column("treatment_sittings", sa.Column("invoice_status", sa.String(length=20), nullable=False, server_default="NOT_INVOICED"))


def downgrade() -> None:
    op.drop_column("treatment_sittings", "invoice_status")
    op.drop_column("treatment_sittings", "paid_amount")
    op.drop_column("treatment_sittings", "charge")

    op.drop_column("cases", "payment_status")
    op.drop_column("cases", "outstanding_balance")
    op.drop_column("cases", "total_paid")
    op.drop_column("cases", "total_billed")
    op.drop_column("cases", "estimated_cost")

    op.drop_index("ix_billing_items_treatment_sitting_id", table_name="billing_items")
    op.drop_index("ix_billing_items_treatment_plan_id", table_name="billing_items")
    op.drop_index("ix_billing_items_billing_id", table_name="billing_items")
    op.drop_table("billing_items")
