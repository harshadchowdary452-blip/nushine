"""Add treatment categories, treatment type fields, and CRM follow-up configs

This migration documents schema changes applied via direct SQL.
The tables and columns already exist in the database.

Revision ID: b5c6d7e8f9a0
Revises: None (standalone - applied via direct SQL)
Create Date: 2026-07-25 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b5c6d7e8f9a0'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NOTE: All operations below were already applied via direct SQL.
    # This migration exists for documentation purposes.

    # 1. Create treatment_categories table
    op.create_table('treatment_categories',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('hospital_id', sa.String(length=36), nullable=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('hospital_id', 'name', name='uq_treatment_category_hospital_name'),
    )
    op.create_index('ix_treatment_categories_hospital_id', 'treatment_categories', ['hospital_id'], unique=False)

    # 2. Add new columns to treatment_types
    op.add_column('treatment_types', sa.Column('treatment_category_id', sa.String(length=36), nullable=True))
    op.add_column('treatment_types', sa.Column('estimated_duration', sa.Integer(), nullable=True))
    op.add_column('treatment_types', sa.Column('default_cost', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('treatment_types', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

    # 3. Drop old unique constraint on (name) and add (hospital_id, name) unique
    op.drop_constraint('treatment_types_name_key', 'treatment_types', type_='unique')
    op.create_unique_constraint('uq_treatment_type_hospital_name', 'treatment_types', ['hospital_id', 'name'])

    # 4. Add FK from treatment_types to treatment_categories
    op.create_foreign_key('fk_treatment_types_category', 'treatment_types', 'treatment_categories',
                          ['treatment_category_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_treatment_types_treatment_category_id', 'treatment_types', ['treatment_category_id'], unique=False)

    # 5. Create crm_follow_up_configs table
    op.create_table('crm_follow_up_configs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('hospital_id', sa.String(length=36), nullable=False),
        sa.Column('context_type', sa.String(length=20), nullable=False),
        sa.Column('treatment_type_id', sa.String(length=36), nullable=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('start_delay_days', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('num_follow_ups', sa.Integer(), nullable=False, server_default=sa.text('3')),
        sa.Column('gap_days', sa.Integer(), nullable=False, server_default=sa.text('2')),
        sa.Column('auto_close_on_completion', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('hospital_id', 'context_type', 'treatment_type_id',
                           name='uq_crm_follow_up_config_hospital_context_treatment'),
    )
    op.create_index('ix_crm_follow_up_configs_hospital_id', 'crm_follow_up_configs', ['hospital_id'], unique=False)
    op.create_index('ix_crm_follow_up_configs_context_type', 'crm_follow_up_configs', ['context_type'], unique=False)
    op.create_foreign_key('fk_crm_follow_up_configs_hospital', 'crm_follow_up_configs', 'hospitals',
                          ['hospital_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_crm_follow_up_configs_treatment_type', 'crm_follow_up_configs', 'treatment_types',
                          ['treatment_type_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_table('crm_follow_up_configs')
    op.drop_index('ix_treatment_types_treatment_category_id', table_name='treatment_types')
    op.drop_constraint('fk_treatment_types_category', 'treatment_types', type_='foreignkey')
    op.drop_constraint('uq_treatment_type_hospital_name', 'treatment_types', type_='unique')
    op.create_unique_constraint('treatment_types_name_key', 'treatment_types', ['name'])
    op.drop_column('treatment_types', 'updated_at')
    op.drop_column('treatment_types', 'default_cost')
    op.drop_column('treatment_types', 'estimated_duration')
    op.drop_column('treatment_types', 'treatment_category_id')
    op.drop_table('treatment_categories')
