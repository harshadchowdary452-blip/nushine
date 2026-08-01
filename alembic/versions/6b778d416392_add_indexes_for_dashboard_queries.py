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


def index_exists(table, index):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return index in [i["name"] for i in inspect(bind).get_indexes(table)]


def upgrade() -> None:
    # Billing indexes for dashboard date-range and case-scoped queries
    if not index_exists('billings', 'ix_billings_updated_at'):
        op.create_index(op.f('ix_billings_updated_at'), 'billings', ['updated_at'], unique=False)
    if not index_exists('billings', 'ix_billings_case_id'):
        op.create_index(op.f('ix_billings_case_id'), 'billings', ['case_id'], unique=False)
    if not index_exists('billings', 'ix_billings_created_at'):
        op.create_index(op.f('ix_billings_created_at'), 'billings', ['created_at'], unique=False)

    # HospitalMonthlyExpense indexes for dashboard expense queries
    if not index_exists('hospital_monthly_expenses', 'ix_hospital_monthly_expenses_hospital_id'):
        op.create_index(op.f('ix_hospital_monthly_expenses_hospital_id'), 'hospital_monthly_expenses', ['hospital_id'], unique=False)
    if not index_exists('hospital_monthly_expenses', 'ix_hospital_monthly_expenses_expense_date'):
        op.create_index(op.f('ix_hospital_monthly_expenses_expense_date'), 'hospital_monthly_expenses', ['expense_date'], unique=False)
    if not index_exists('hospital_monthly_expenses', 'ix_hospital_monthly_expenses_expense_month'):
        op.create_index(op.f('ix_hospital_monthly_expenses_expense_month'), 'hospital_monthly_expenses', ['expense_month'], unique=False)
    if not index_exists('hospital_monthly_expenses', 'ix_hospital_monthly_expenses_expense_year'):
        op.create_index(op.f('ix_hospital_monthly_expenses_expense_year'), 'hospital_monthly_expenses', ['expense_year'], unique=False)


def downgrade() -> None:
    for table, indexes in (
        ('billings', ('ix_billings_updated_at', 'ix_billings_case_id', 'ix_billings_created_at')),
        ('hospital_monthly_expenses', ('ix_hospital_monthly_expenses_hospital_id', 'ix_hospital_monthly_expenses_expense_date', 'ix_hospital_monthly_expenses_expense_month', 'ix_hospital_monthly_expenses_expense_year')),
    ):
        for index in indexes:
            if index_exists(table, index):
                op.drop_index(op.f(index), table_name=table)
