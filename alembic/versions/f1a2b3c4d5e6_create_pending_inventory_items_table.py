"""create pending inventory items table

Revision ID: f1a2b3c4d5e6
Revises: d0c1b2a3e4f5
Create Date: 2026-08-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'd0c1b2a3e4f5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'pending_inventory_items',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('hospital_id', sa.String(36), nullable=False),
        sa.Column('item_name', sa.String(255), nullable=False),
        sa.Column('unit', sa.String(50), nullable=False),
        sa.Column('required_quantity', sa.Float(), nullable=True),
        sa.Column('estimated_cost', sa.Float(), nullable=False),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('category_id', sa.String(36), nullable=True),
        sa.Column('converted_item_id', sa.String(36), nullable=True),
        sa.Column('review_notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(36), nullable=True),
        sa.Column('reviewed_by', sa.String(36), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['category_id'], ['inventory_categories.id'], name='fk_pending_items_category'),
        sa.ForeignKeyConstraint(['converted_item_id'], ['inventory_master.id'], name='fk_pending_items_converted'),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], name='fk_pending_items_hospital'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_pending_inventory_items_hospital_id', 'pending_inventory_items', ['hospital_id'])
    op.create_index('ix_pending_inventory_items_item_name', 'pending_inventory_items', ['item_name'])
    op.create_index('ix_pending_inventory_items_status', 'pending_inventory_items', ['status'])
    op.create_index('ix_pending_inventory_items_category_id', 'pending_inventory_items', ['category_id'])
    op.create_index('ix_pending_inventory_items_converted_item_id', 'pending_inventory_items', ['converted_item_id'])


def downgrade() -> None:
    op.drop_table('pending_inventory_items')
