"""Add lead CRM fields

Revision ID: abcd1234efgh
Revises: 9cc0dd9aace5
Create Date: 2026-06-15 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "abcd1234efgh"
down_revision: Union[str, None] = "9cc0dd9aace5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("lead_score", sa.Integer(), nullable=False, server_default=sa.text("0")))
    op.add_column("leads", sa.Column("last_contacted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("leads", sa.Column("next_follow_up_date", sa.Date(), nullable=True))
    op.add_column("leads", sa.Column("priority", sa.String(length=20), nullable=False, server_default=sa.text("'MEDIUM'")))


def downgrade() -> None:
    op.drop_column("leads", "priority")
    op.drop_column("leads", "next_follow_up_date")
    op.drop_column("leads", "last_contacted_at")
    op.drop_column("leads", "lead_score")
