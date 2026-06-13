"""add treatment_id column to follow_ups

Revision ID: 8dd832621ad0
Revises: ac30119a2a87
Create Date: 2026-06-13 17:29:45.532229

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '8dd832621ad0'
down_revision: Union[str, None] = 'ac30119a2a87'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('follow_ups', sa.Column('treatment_id', sa.String(length=36), nullable=True))


def downgrade() -> None:
    op.drop_column('follow_ups', 'treatment_id')
