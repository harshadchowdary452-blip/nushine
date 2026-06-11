"""add_status_to_treatment_plans_and_sittings

Revision ID: a934fb8062bc
Revises: 210f57adcad3
Create Date: 2026-06-11 15:47:17.821733

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a934fb8062bc'
down_revision: Union[str, None] = '210f57adcad3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('treatment_plans', sa.Column('status', sa.String(length=50), server_default='PLANNED', nullable=False))
    op.add_column('treatment_sittings', sa.Column('status', sa.String(length=50), server_default='PLANNED', nullable=False))


def downgrade() -> None:
    op.drop_column('treatment_sittings', 'status')
    op.drop_column('treatment_plans', 'status')
