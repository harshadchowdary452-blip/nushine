"""add_treatment_fields_to_plans

Revision ID: e6f7a8b9c0d1
Revises: 075bb72760a7
Create Date: 2026-06-13 14:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, None] = '075bb72760a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    if conn.engine.name == "sqlite":
        op.add_column('treatment_plans', sa.Column('start_date', sa.Date(), nullable=True))
        op.add_column('treatment_plans', sa.Column('expected_completion_date', sa.Date(), nullable=True))
        op.add_column('treatment_plans', sa.Column('paid_amount', sa.Float(), nullable=False, server_default='0.0'))
    else:
        op.add_column('treatment_plans', sa.Column('start_date', sa.Date(), nullable=True))
        op.add_column('treatment_plans', sa.Column('expected_completion_date', sa.Date(), nullable=True))
        op.add_column('treatment_plans', sa.Column('paid_amount', sa.Float(), nullable=False, server_default='0.0'))


def downgrade() -> None:
    conn = op.get_bind()
    if conn.engine.name == "sqlite":
        # SQLite only supports DROP COLUMN from version 3.35.0
        op.drop_column('treatment_plans', 'paid_amount')
        op.drop_column('treatment_plans', 'expected_completion_date')
        op.drop_column('treatment_plans', 'start_date')
    else:
        op.drop_column('treatment_plans', 'paid_amount')
        op.drop_column('treatment_plans', 'expected_completion_date')
        op.drop_column('treatment_plans', 'start_date')
