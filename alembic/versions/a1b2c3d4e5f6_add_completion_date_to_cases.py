"""add_completion_date_to_cases

Revision ID: a1b2c3d4e5f6
Revises: f5e8c2d1a4b9
Create Date: 2026-06-11 13:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f5e8c2d1a4b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('cases', sa.Column('completion_date', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('cases', 'completion_date')
