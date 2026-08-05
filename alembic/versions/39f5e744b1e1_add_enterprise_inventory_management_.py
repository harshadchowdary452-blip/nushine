"""add enterprise inventory management tables

Revision ID: 39f5e744b1e1
Revises: d6e7f8a9b0c1
Create Date: 2026-08-05 12:50:47.169753

Phase 2A-1 Enterprise Inventory & Procurement foundation:
inventory_categories, suppliers, inventory_master (global catalog),
hospital_inventory (per-hospital stock), inventory_transactions (ledger).

Default categories are seeded by the app startup seeder
(seed_default_inventory_categories) so both migration-created and fresh
(test, create_all) databases receive the same defaults.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '39f5e744b1e1'
down_revision: Union[str, None] = 'd6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('inventory_categories',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('code', sa.String(length=50), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('parent_id', sa.String(length=36), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['parent_id'], ['inventory_categories.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_inventory_categories_code'), 'inventory_categories', ['code'], unique=True)
    op.create_index(op.f('ix_inventory_categories_name'), 'inventory_categories', ['name'], unique=False)
    op.create_index(op.f('ix_inventory_categories_parent_id'), 'inventory_categories', ['parent_id'], unique=False)
    op.create_table('suppliers',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('code', sa.String(length=50), nullable=True),
    sa.Column('contact_person', sa.String(length=255), nullable=True),
    sa.Column('phone', sa.String(length=50), nullable=True),
    sa.Column('email', sa.String(length=255), nullable=True),
    sa.Column('address', sa.Text(), nullable=True),
    sa.Column('gst_number', sa.String(length=50), nullable=True),
    sa.Column('payment_terms', sa.String(length=255), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_suppliers_code'), 'suppliers', ['code'], unique=True)
    op.create_index(op.f('ix_suppliers_name'), 'suppliers', ['name'], unique=False)
    op.create_index(op.f('ix_suppliers_status'), 'suppliers', ['status'], unique=False)
    op.create_table('inventory_master',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('code', sa.String(length=50), nullable=False),
    sa.Column('category_id', sa.String(length=36), nullable=True),
    sa.Column('sub_category_id', sa.String(length=36), nullable=True),
    sa.Column('brand', sa.String(length=100), nullable=True),
    sa.Column('manufacturer', sa.String(length=255), nullable=True),
    sa.Column('preferred_vendor_id', sa.String(length=36), nullable=True),
    sa.Column('unit', sa.String(length=50), nullable=False),
    sa.Column('purchase_price', sa.Float(), nullable=False),
    sa.Column('average_cost', sa.Float(), nullable=False),
    sa.Column('minimum_stock', sa.Float(), nullable=False),
    sa.Column('reorder_level', sa.Float(), nullable=False),
    sa.Column('critical_level', sa.Float(), nullable=False),
    sa.Column('maximum_stock', sa.Float(), nullable=False),
    sa.Column('batch_tracking', sa.Boolean(), nullable=False),
    sa.Column('expiry_tracking', sa.Boolean(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('image_url', sa.String(length=500), nullable=True),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['category_id'], ['inventory_categories.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['preferred_vendor_id'], ['suppliers.id'], ),
    sa.ForeignKeyConstraint(['sub_category_id'], ['inventory_categories.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_inventory_master_category_id'), 'inventory_master', ['category_id'], unique=False)
    op.create_index(op.f('ix_inventory_master_code'), 'inventory_master', ['code'], unique=True)
    op.create_index(op.f('ix_inventory_master_name'), 'inventory_master', ['name'], unique=False)
    op.create_index(op.f('ix_inventory_master_preferred_vendor_id'), 'inventory_master', ['preferred_vendor_id'], unique=False)
    op.create_index(op.f('ix_inventory_master_status'), 'inventory_master', ['status'], unique=False)
    op.create_index(op.f('ix_inventory_master_sub_category_id'), 'inventory_master', ['sub_category_id'], unique=False)
    op.create_table('hospital_inventory',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('hospital_id', sa.String(length=36), nullable=False),
    sa.Column('item_id', sa.String(length=36), nullable=False),
    sa.Column('unit', sa.String(length=50), nullable=True),
    sa.Column('quantity', sa.Float(), nullable=False),
    sa.Column('minimum_stock', sa.Float(), nullable=True),
    sa.Column('reorder_level', sa.Float(), nullable=True),
    sa.Column('critical_level', sa.Float(), nullable=True),
    sa.Column('maximum_stock', sa.Float(), nullable=True),
    sa.Column('location', sa.String(length=255), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ),
    sa.ForeignKeyConstraint(['item_id'], ['inventory_master.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('hospital_id', 'item_id', name='uq_hospital_inventory_hospital_item')
    )
    op.create_index(op.f('ix_hospital_inventory_hospital_id'), 'hospital_inventory', ['hospital_id'], unique=False)
    op.create_index(op.f('ix_hospital_inventory_item_id'), 'hospital_inventory', ['item_id'], unique=False)
    op.create_table('inventory_transactions',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('hospital_id', sa.String(length=36), nullable=False),
    sa.Column('item_id', sa.String(length=36), nullable=False),
    sa.Column('transaction_type', sa.Enum('PURCHASE', 'GOODS_RECEIPT', 'CONSUMPTION', 'MANUAL_ADJUSTMENT', 'DAMAGE', 'EXPIRY', 'CORRECTION', 'OPENING_STOCK', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN', name='inventorytransactiontype'), nullable=False),
    sa.Column('previous_balance', sa.Float(), nullable=False),
    sa.Column('quantity', sa.Float(), nullable=False),
    sa.Column('current_balance', sa.Float(), nullable=False),
    sa.Column('batch_number', sa.String(length=100), nullable=True),
    sa.Column('expiry_date', sa.Date(), nullable=True),
    sa.Column('reference_type', sa.String(length=50), nullable=True),
    sa.Column('reference_id', sa.String(length=36), nullable=True),
    sa.Column('reason', sa.String(length=255), nullable=True),
    sa.Column('remarks', sa.Text(), nullable=True),
    sa.Column('transaction_date', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ),
    sa.ForeignKeyConstraint(['item_id'], ['inventory_master.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_inventory_transactions_hospital_id'), 'inventory_transactions', ['hospital_id'], unique=False)
    op.create_index(op.f('ix_inventory_transactions_item_id'), 'inventory_transactions', ['item_id'], unique=False)
    op.create_index(op.f('ix_inventory_transactions_transaction_date'), 'inventory_transactions', ['transaction_date'], unique=False)
    op.create_index(op.f('ix_inventory_transactions_transaction_type'), 'inventory_transactions', ['transaction_type'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_inventory_transactions_transaction_type'), table_name='inventory_transactions')
    op.drop_index(op.f('ix_inventory_transactions_transaction_date'), table_name='inventory_transactions')
    op.drop_index(op.f('ix_inventory_transactions_item_id'), table_name='inventory_transactions')
    op.drop_index(op.f('ix_inventory_transactions_hospital_id'), table_name='inventory_transactions')
    op.drop_table('inventory_transactions')
    op.drop_index(op.f('ix_hospital_inventory_item_id'), table_name='hospital_inventory')
    op.drop_index(op.f('ix_hospital_inventory_hospital_id'), table_name='hospital_inventory')
    op.drop_table('hospital_inventory')
    op.drop_index(op.f('ix_inventory_master_sub_category_id'), table_name='inventory_master')
    op.drop_index(op.f('ix_inventory_master_status'), table_name='inventory_master')
    op.drop_index(op.f('ix_inventory_master_preferred_vendor_id'), table_name='inventory_master')
    op.drop_index(op.f('ix_inventory_master_name'), table_name='inventory_master')
    op.drop_index(op.f('ix_inventory_master_code'), table_name='inventory_master')
    op.drop_index(op.f('ix_inventory_master_category_id'), table_name='inventory_master')
    op.drop_table('inventory_master')
    op.drop_index(op.f('ix_suppliers_status'), table_name='suppliers')
    op.drop_index(op.f('ix_suppliers_name'), table_name='suppliers')
    op.drop_index(op.f('ix_suppliers_code'), table_name='suppliers')
    op.drop_table('suppliers')
    op.drop_index(op.f('ix_inventory_categories_parent_id'), table_name='inventory_categories')
    op.drop_index(op.f('ix_inventory_categories_name'), table_name='inventory_categories')
    op.drop_index(op.f('ix_inventory_categories_code'), table_name='inventory_categories')
    op.drop_table('inventory_categories')
