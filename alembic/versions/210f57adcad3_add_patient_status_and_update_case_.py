"""add patient status and update case status

Revision ID: 210f57adcad3
Revises: add_admin_group_id_to_users
Create Date: 2026-06-10 21:58:33.788503

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '210f57adcad3'
down_revision: Union[str, None] = 'add_admin_group_id_to_users'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('patients', sa.Column('status', sa.String(length=20), server_default='ACTIVE', nullable=False))


def downgrade() -> None:
    op.drop_column('patients', 'status')
