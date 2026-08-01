"""add_audit_fields_to_case_and_timeline

Revision ID: 0bb8f891b9e6
Revises: 320b6f23ebad
Create Date: 2026-07-04 18:05:46.282590

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '0bb8f891b9e6'
down_revision: Union[str, None] = '320b6f23ebad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return column in [c["name"] for c in inspect(bind).get_columns(table)]


def fk_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return any(column in fk["constrained_columns"] for fk in inspect(bind).get_foreign_keys(table))


def upgrade() -> None:
    if not column_exists('case_timelines', 'performer_role'):
        op.add_column('case_timelines', sa.Column('performer_role', sa.String(length=50), nullable=True))
    if not column_exists('cases', 'created_by_id'):
        op.add_column('cases', sa.Column('created_by_id', sa.String(length=36), nullable=True))
    if not column_exists('cases', 'updated_by_id'):
        op.add_column('cases', sa.Column('updated_by_id', sa.String(length=36), nullable=True))
    if not fk_exists('cases', 'created_by_id'):
        op.create_foreign_key('fk_cases_created_by', 'cases', 'users', ['created_by_id'], ['id'])
    if not fk_exists('cases', 'updated_by_id'):
        op.create_foreign_key('fk_cases_updated_by', 'cases', 'users', ['updated_by_id'], ['id'])


def downgrade() -> None:
    if fk_exists('cases', 'updated_by_id'):
        op.drop_constraint('fk_cases_updated_by', 'cases', type_='foreignkey')
    if fk_exists('cases', 'created_by_id'):
        op.drop_constraint('fk_cases_created_by', 'cases', type_='foreignkey')
    for column in ('updated_by_id', 'created_by_id'):
        if column_exists('cases', column):
            op.drop_column('cases', column)
    if column_exists('case_timelines', 'performer_role'):
        op.drop_column('case_timelines', 'performer_role')
