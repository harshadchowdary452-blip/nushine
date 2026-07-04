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


def upgrade() -> None:
    op.add_column('case_timelines', sa.Column('performer_role', sa.String(length=50), nullable=True))
    op.add_column('cases', sa.Column('created_by_id', sa.String(length=36), nullable=True))
    op.add_column('cases', sa.Column('updated_by_id', sa.String(length=36), nullable=True))
    op.create_foreign_key('fk_cases_created_by', 'cases', 'users', ['created_by_id'], ['id'])
    op.create_foreign_key('fk_cases_updated_by', 'cases', 'users', ['updated_by_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_cases_updated_by', 'cases', type_='foreignkey')
    op.drop_constraint('fk_cases_created_by', 'cases', type_='foreignkey')
    op.drop_column('cases', 'updated_by_id')
    op.drop_column('cases', 'created_by_id')
    op.drop_column('case_timelines', 'performer_role')
