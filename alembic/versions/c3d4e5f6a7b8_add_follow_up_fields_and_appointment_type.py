"""add_follow_up_fields_and_appointment_type

Revision ID: c3d4e5f6a7b8
Revises: fafeb9751a15
Create Date: 2026-06-11 23:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'fafeb9751a15'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('appointments', sa.Column('appointment_type', sa.String(length=20), nullable=False, server_default='CONSULTATION'))


def downgrade() -> None:
    op.drop_column('appointments', 'appointment_type')
