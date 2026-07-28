"""Add recall recurrence columns to generated_enquiries

Revision ID: d4e5f6a7b8c9
Revises: c9d0e1f2a3b4
Create Date: 2026-07-28
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c9d0e1f2a3b4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('generated_enquiries', sa.Column('is_recurring', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('generated_enquiries', sa.Column('occurrence_number', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('generated_enquiries', sa.Column('recurrence_interval_days', sa.Integer(), nullable=True))
    op.add_column('generated_enquiries', sa.Column('chain_id', sa.String(36), nullable=True))
    op.create_index('ix_generated_enquiries_chain_id', 'generated_enquiries', ['chain_id'])


def downgrade() -> None:
    op.drop_index('ix_generated_enquiries_chain_id', table_name='generated_enquiries')
    op.drop_column('generated_enquiries', 'chain_id')
    op.drop_column('generated_enquiries', 'recurrence_interval_days')
    op.drop_column('generated_enquiries', 'occurrence_number')
    op.drop_column('generated_enquiries', 'is_recurring')
