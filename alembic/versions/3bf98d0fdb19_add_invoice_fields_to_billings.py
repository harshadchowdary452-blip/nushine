"""add invoice fields to billings

Revision ID: 3bf98d0fdb19
Revises: 8b7f8997e903
Create Date: 2026-06-12 15:30:41.345393

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect as sa_inspect
import sqlalchemy as sa


revision: str = '3bf98d0fdb19'
down_revision: Union[str, None] = '8b7f8997e903'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing = {c["name"] for c in inspector.get_columns("billings")}
    if "invoice_number" not in existing:
        op.add_column('billings', sa.Column('invoice_number', sa.String(length=50), nullable=True))
    if "due_date" not in existing:
        op.add_column('billings', sa.Column('due_date', sa.Date(), nullable=True))
    if "projected_amount" not in existing:
        op.add_column('billings', sa.Column('projected_amount', sa.Float(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing = {c["name"] for c in inspector.get_columns("billings")}
    if "projected_amount" in existing:
        op.drop_column('billings', 'projected_amount')
    if "due_date" in existing:
        op.drop_column('billings', 'due_date')
    if "invoice_number" in existing:
        op.drop_column('billings', 'invoice_number')
