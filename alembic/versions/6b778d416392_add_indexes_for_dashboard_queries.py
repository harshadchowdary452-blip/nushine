"""add_indexes_for_dashboard_queries

Revision ID: 6b778d416392
Revises: 9f7ebbffc4cf
Create Date: 2026-06-26 10:51:02.840875

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '6b778d416392'
down_revision: Union[str, None] = '9f7ebbffc4cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Billing indexes for dashboard date-range and case-scoped queries
    op.create_index(op.f('ix_billings_updated_at'), 'billings', ['updated_at'], unique=False)
    op.create_index(op.f('ix_billings_case_id'), 'billings', ['case_id'], unique=False)
    op.create_index(op.f('ix_billings_created_at'), 'billings', ['created_at'], unique=False)

    # HospitalMonthlyExpense indexes for dashboard expense queries
    op.create_index(op.f('ix_hospital_monthly_expenses_hospital_id'), 'hospital_monthly_expenses', ['hospital_id'], unique=False)
    op.create_index(op.f('ix_hospital_monthly_expenses_expense_date'), 'hospital_monthly_expenses', ['expense_date'], unique=False)
    op.create_index(op.f('ix_hospital_monthly_expenses_expense_month'), 'hospital_monthly_expenses', ['expense_month'], unique=False)
    op.create_index(op.f('ix_hospital_monthly_expenses_expense_year'), 'hospital_monthly_expenses', ['expense_year'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_billings_updated_at'), table_name='billings')
    op.drop_index(op.f('ix_billings_case_id'), table_name='billings')
    op.drop_index(op.f('ix_billings_created_at'), table_name='billings')
    op.drop_index(op.f('ix_hospital_monthly_expenses_hospital_id'), table_name='hospital_monthly_expenses')
    op.drop_index(op.f('ix_hospital_monthly_expenses_expense_date'), table_name='hospital_monthly_expenses')
    op.drop_index(op.f('ix_hospital_monthly_expenses_expense_month'), table_name='hospital_monthly_expenses')
    op.drop_index(op.f('ix_hospital_monthly_expenses_expense_year'), table_name='hospital_monthly_expenses')
