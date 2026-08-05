"""add submitted_by to monthly_orders and hospital_id to audit_logs

Revision ID: a3b4c5d6e7f8
Revises: f1a2b3c4d5e6
Create Date: 2026-08-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a3b4c5d6e7f8'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('monthly_orders', sa.Column('submitted_by', sa.String(36), nullable=True))
    op.create_foreign_key(
        'fk_monthly_orders_submitted_by', 'monthly_orders', 'users',
        ['submitted_by'], ['id'],
    )
    op.add_column('audit_logs', sa.Column('hospital_id', sa.String(36), nullable=True))
    op.create_foreign_key(
        'fk_audit_logs_hospital', 'audit_logs', 'hospitals',
        ['hospital_id'], ['id'],
    )
    op.create_index('ix_audit_logs_hospital_id', 'audit_logs', ['hospital_id'])


def downgrade() -> None:
    op.drop_index('ix_audit_logs_hospital_id', table_name='audit_logs')
    op.drop_constraint('fk_audit_logs_hospital', 'audit_logs', type_='foreignkey')
    op.drop_column('audit_logs', 'hospital_id')
    op.drop_constraint('fk_monthly_orders_submitted_by', 'monthly_orders', type_='foreignkey')
    op.drop_column('monthly_orders', 'submitted_by')
