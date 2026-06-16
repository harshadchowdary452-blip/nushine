"""create_billing_history_table

Revision ID: d4e5f6a7b8d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-16 11:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8d0'
down_revision: Union[str, None] = 'add_original_source_to_patients'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('billing_histories',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('billing_id', sa.String(length=36), nullable=False),
        sa.Column('action', sa.String(length=50), nullable=False),
        sa.Column('previous_data', sa.Text(), nullable=True),
        sa.Column('new_data', sa.Text(), nullable=True),
        sa.Column('changes_summary', sa.String(length=500), nullable=True),
        sa.Column('performed_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['billing_id'], ['billings.id'], ),
        sa.ForeignKeyConstraint(['performed_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_billing_histories_billing_id'), 'billing_histories', ['billing_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_billing_histories_billing_id'), table_name='billing_histories')
    op.drop_table('billing_histories')
