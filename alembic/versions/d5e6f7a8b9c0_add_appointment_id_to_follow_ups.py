"""add appointment_id to follow_ups

Revision ID: d5e6f7a8b9c0
Revises: d4e5f6a7b8d1
Create Date: 2026-06-12 06:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, None] = 'd4e5f6a7b8d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('follow_ups', sa.Column('appointment_id', sa.String(length=36), nullable=True))
    op.add_column('follow_ups', sa.Column('follow_up_time', sa.Time(), nullable=True))


def downgrade() -> None:
    op.drop_column('follow_ups', 'follow_up_time')
    op.drop_column('follow_ups', 'appointment_id')
