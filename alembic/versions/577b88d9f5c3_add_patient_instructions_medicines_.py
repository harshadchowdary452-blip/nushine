"""add_patient_instructions_medicines_followup_fields

Revision ID: 577b88d9f5c3
Revises: 0bb8f891b9e6
Create Date: 2026-07-06 11:52:28.828047

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '577b88d9f5c3'
down_revision: Union[str, None] = '0bb8f891b9e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return column in [c["name"] for c in inspect(bind).get_columns(table)]


def upgrade() -> None:
    if not column_exists('cases', 'patient_instructions'):
        op.add_column('cases', sa.Column('patient_instructions', sa.Text(), nullable=True))
    if not column_exists('cases', 'medicines_prescribed'):
        op.add_column('cases', sa.Column('medicines_prescribed', sa.Text(), nullable=True))
    if not column_exists('cases', 'follow_up_instructions'):
        op.add_column('cases', sa.Column('follow_up_instructions', sa.Text(), nullable=True))
    if not column_exists('cases', 'next_review_date'):
        op.add_column('cases', sa.Column('next_review_date', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    for column in ('next_review_date', 'follow_up_instructions', 'medicines_prescribed', 'patient_instructions'):
        if column_exists('cases', column):
            op.drop_column('cases', column)
