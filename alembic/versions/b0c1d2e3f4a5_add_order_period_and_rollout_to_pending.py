"""add order_period and rollout to pending inventory items

Revision ID: b0c1d2e3f4a5
Revises: a3b4c5d6e7f8
Create Date: 2026-08-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'b0c1d2e3f4a5'
down_revision = 'a3b4c5d6e7f8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('pending_inventory_items', sa.Column('order_period', sa.String(7), nullable=True))
    op.create_index('ix_pending_inventory_items_order_period', 'pending_inventory_items', ['order_period'])
    op.add_column('pending_inventory_items', sa.Column('rollout', sa.String(20), nullable=False, server_default='ALL'))


def downgrade() -> None:
    op.drop_column('pending_inventory_items', 'rollout')
    op.drop_index('ix_pending_inventory_items_order_period', table_name='pending_inventory_items')
    op.drop_column('pending_inventory_items', 'order_period')
