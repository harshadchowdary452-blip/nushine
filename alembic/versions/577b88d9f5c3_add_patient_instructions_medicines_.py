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


def upgrade() -> None:
    op.add_column('cases', sa.Column('patient_instructions', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('medicines_prescribed', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('follow_up_instructions', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('next_review_date', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('cases', 'next_review_date')
    op.drop_column('cases', 'follow_up_instructions')
    op.drop_column('cases', 'medicines_prescribed')
    op.drop_column('cases', 'patient_instructions')
