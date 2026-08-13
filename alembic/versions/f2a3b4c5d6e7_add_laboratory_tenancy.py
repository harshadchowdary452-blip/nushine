"""add hospital tenancy to laboratories

Revision ID: f2a3b4c5d6e7
Revises: f0a1b2c3d4e5
Create Date: 2026-08-13 00:00:00.000000

Scopes the laboratory master per hospital / admin group so that Hospital Admins
manage their own hospital's laboratories (including single-hospital orgs without
a Group Admin) while Group Admins see all hospitals in their group.
"""
from typing import Union, Sequence
from alembic import op
import sqlalchemy as sa


revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, None] = 'f0a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('laboratories', sa.Column('hospital_id', sa.String(36), nullable=True))
    op.add_column('laboratories', sa.Column('admin_group_id', sa.String(36), nullable=True))
    op.create_index('ix_laboratories_hospital_id', 'laboratories', ['hospital_id'], unique=False)
    op.create_index('ix_laboratories_admin_group_id', 'laboratories', ['admin_group_id'], unique=False)
    op.create_foreign_key('fk_laboratories_hospital_id', 'laboratories', 'hospitals', ['hospital_id'], ['id'])
    op.create_foreign_key('fk_laboratories_admin_group_id', 'laboratories', 'admin_groups', ['admin_group_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_laboratories_admin_group_id', 'laboratories', type_='foreignkey')
    op.drop_constraint('fk_laboratories_hospital_id', 'laboratories', type_='foreignkey')
    op.drop_index('ix_laboratories_admin_group_id', table_name='laboratories')
    op.drop_index('ix_laboratories_hospital_id', table_name='laboratories')
    op.drop_column('laboratories', 'admin_group_id')
    op.drop_column('laboratories', 'hospital_id')
