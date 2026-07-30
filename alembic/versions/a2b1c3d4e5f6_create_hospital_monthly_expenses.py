"""create hospital monthly expenses table

Revision ID: a2b1c3d4e5f6
Revises: b2c3d4e5f6a8
Create Date: 2026-06-11 17:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a2b1c3d4e5f6'
down_revision: Union[str, None] = 'b2c3d4e5f6a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'hospital_monthly_expenses',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('hospital_id', sa.String(36), sa.ForeignKey('hospitals.id'), nullable=False),
        sa.Column('expense_month', sa.Integer, nullable=False),
        sa.Column('expense_year', sa.Integer, nullable=False),
        sa.Column('expense_category', sa.String(255), nullable=False),
        sa.Column('expense_name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('amount', sa.Float, nullable=False),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('hospital_monthly_expenses')
