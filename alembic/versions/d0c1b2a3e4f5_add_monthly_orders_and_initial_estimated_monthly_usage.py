"""add monthly orders and initial estimated monthly usage

Revision ID: d0c1b2a3e4f5
Revises: 39f5e744b1e1
Create Date: 2026-08-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'd0c1b2a3e4f5'
down_revision = '39f5e744b1e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'inventory_master',
        sa.Column('initial_estimated_monthly_usage', sa.Float(), server_default='0', nullable=False),
    )

    op.create_table(
        'monthly_orders',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('hospital_id', sa.String(36), nullable=False),
        sa.Column('admin_group_id', sa.String(36), nullable=True),
        sa.Column('order_period', sa.String(7), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('submitted_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reviewed_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('approved_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ordered_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('estimated_cost_total', sa.Float(), server_default='0', nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], name='fk_monthly_orders_hospital'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('hospital_id', 'order_period', name='uq_monthly_order_hospital_period'),
    )
    op.create_index('ix_monthly_orders_hospital_id', 'monthly_orders', ['hospital_id'])
    op.create_index('ix_monthly_orders_order_period', 'monthly_orders', ['order_period'])
    op.create_index('ix_monthly_orders_status', 'monthly_orders', ['status'])

    op.create_table(
        'monthly_order_items',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('order_id', sa.String(36), nullable=False),
        sa.Column('item_id', sa.String(36), nullable=False),
        sa.Column('item_name', sa.String(255), nullable=True),
        sa.Column('item_code', sa.String(50), nullable=True),
        sa.Column('unit', sa.String(50), nullable=True),
        sa.Column('current_stock', sa.Float(), server_default='0', nullable=False),
        sa.Column('minimum_stock', sa.Float(), server_default='0', nullable=False),
        sa.Column('avg_monthly_usage', sa.Float(), server_default='0', nullable=False),
        sa.Column('remaining_days', sa.Float(), nullable=True),
        sa.Column('suggested_quantity', sa.Float(), server_default='0', nullable=False),
        sa.Column('required_quantity', sa.Float(), server_default='0', nullable=False),
        sa.Column('unit_cost', sa.Float(), server_default='0', nullable=False),
        sa.Column('estimated_cost', sa.Float(), server_default='0', nullable=False),
        sa.Column('preferred_supplier_name', sa.String(255), nullable=True),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['item_id'], ['inventory_master.id'], name='fk_monthly_order_items_item'),
        sa.ForeignKeyConstraint(['order_id'], ['monthly_orders.id'], name='fk_monthly_order_items_order'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_monthly_order_items_order_id', 'monthly_order_items', ['order_id'])
    op.create_index('ix_monthly_order_items_item_id', 'monthly_order_items', ['item_id'])


def downgrade() -> None:
    op.drop_table('monthly_order_items')
    op.drop_table('monthly_orders')
    op.drop_column('inventory_master', 'initial_estimated_monthly_usage')
