"""add discount fields to treatment_plans

Revision ID: f4a5b6c7d8e9
Revises: f2a3b4c5d6e7
Create Date: 2026-08-13 00:00:00.000000

Gives treatment plans the same discount capability as billings:
discount_type (PERCENTAGE/FIXED), discount_percent, discount_amount,
discount_reason, and a snapshot of the gross amount (original_amount) at the
time the discount was first applied so re-applying never compounds.
"""
from typing import Union, Sequence
from alembic import op
import sqlalchemy as sa


revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('treatment_plans', sa.Column('discount_type', sa.String(20), nullable=False, server_default='PERCENTAGE'))
    op.add_column('treatment_plans', sa.Column('discount_percent', sa.Float(), nullable=False, server_default='0'))
    op.add_column('treatment_plans', sa.Column('discount_amount', sa.Float(), nullable=False, server_default='0'))
    op.add_column('treatment_plans', sa.Column('discount_reason', sa.String(255), nullable=True))
    op.add_column('treatment_plans', sa.Column('original_amount', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('treatment_plans', 'original_amount')
    op.drop_column('treatment_plans', 'discount_reason')
    op.drop_column('treatment_plans', 'discount_amount')
    op.drop_column('treatment_plans', 'discount_percent')
    op.drop_column('treatment_plans', 'discount_type')
