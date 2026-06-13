"""add diagnosis to patients

Revision ID: 8b7f8997e903
Revises: d5e6f7a8b9c0
Create Date: 2026-06-12 14:13:27.174995

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '8b7f8997e903'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('patients', sa.Column('diagnosis', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('patients', 'diagnosis')
