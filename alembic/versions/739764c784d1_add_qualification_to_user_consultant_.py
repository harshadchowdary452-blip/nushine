"""add_qualification_to_user_consultant_case

Revision ID: 739764c784d1
Revises: 047240820871
Create Date: 2026-07-09 14:36:01.198768

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '739764c784d1'
down_revision: Union[str, None] = '047240820871'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return column in [c["name"] for c in inspect(bind).get_columns(table)]


def upgrade() -> None:
    if not column_exists('users', 'qualification'):
        op.add_column('users', sa.Column('qualification', sa.String(length=255), nullable=True))
    if not column_exists('consultants', 'qualification'):
        op.add_column('consultants', sa.Column('qualification', sa.String(length=255), nullable=True))
    if not column_exists('cases', 'doctor_qualification'):
        op.add_column('cases', sa.Column('doctor_qualification', sa.String(length=100), nullable=True))


def downgrade() -> None:
    for table, column in (('cases', 'doctor_qualification'), ('consultants', 'qualification'), ('users', 'qualification')):
        if column_exists(table, column):
            op.drop_column(table, column)
