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


def column_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    return column in [c["name"] for c in inspector.get_columns(table)]


def index_exists(table, index):
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    return index in [i["name"] for i in inspector.get_indexes(table)]


def upgrade() -> None:
    if not column_exists('generated_enquiries', 'is_recurring'):
        op.add_column('generated_enquiries', sa.Column('is_recurring', sa.Boolean(), nullable=False, server_default='false'))
    if not column_exists('generated_enquiries', 'occurrence_number'):
        op.add_column('generated_enquiries', sa.Column('occurrence_number', sa.Integer(), nullable=False, server_default='1'))
    if not column_exists('generated_enquiries', 'recurrence_interval_days'):
        op.add_column('generated_enquiries', sa.Column('recurrence_interval_days', sa.Integer(), nullable=True))
    if not column_exists('generated_enquiries', 'chain_id'):
        op.add_column('generated_enquiries', sa.Column('chain_id', sa.String(36), nullable=True))
    if not index_exists('generated_enquiries', 'ix_generated_enquiries_chain_id'):
        op.create_index('ix_generated_enquiries_chain_id', 'generated_enquiries', ['chain_id'])


def downgrade() -> None:
    if index_exists('generated_enquiries', 'ix_generated_enquiries_chain_id'):
        op.drop_index('ix_generated_enquiries_chain_id', table_name='generated_enquiries')
    for column in ('chain_id', 'recurrence_interval_days', 'occurrence_number', 'is_recurring'):
        if column_exists('generated_enquiries', column):
            op.drop_column('generated_enquiries', column)
