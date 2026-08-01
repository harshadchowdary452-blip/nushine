"""add interested_to_visit_again to follow_ups

Revision ID: 667f59e07a89
Revises: b1c2d3e4f5a6
Create Date: 2026-07-04 16:59:53.529215

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '667f59e07a89'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return column in [c["name"] for c in inspect(bind).get_columns(table)]


def upgrade() -> None:
    if not column_exists('follow_ups', 'interested_to_visit_again'):
        op.add_column('follow_ups', sa.Column('interested_to_visit_again', sa.String(length=10), nullable=True))


def downgrade() -> None:
    if column_exists('follow_ups', 'interested_to_visit_again'):
        op.drop_column('follow_ups', 'interested_to_visit_again')
    # ### end Alembic commands ###
