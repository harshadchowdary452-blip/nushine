"""Add skip_wellness_if_appointment to crm_follow_up_configs

Revision ID: c9d0e1f2a3b4
Revises: fc884b151f2b
Create Date: 2026-07-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'c9d0e1f2a3b4'
down_revision = 'fc884b151f2b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('crm_follow_up_configs', sa.Column('skip_wellness_if_appointment', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('crm_follow_up_configs', 'skip_wellness_if_appointment')
