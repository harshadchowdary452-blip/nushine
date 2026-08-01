"""add_dentition_type_surface_to_clinical_findings

Revision ID: 047240820871
Revises: 577b88d9f5c3
Create Date: 2026-07-06 12:37:44.393108

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '047240820871'
down_revision: Union[str, None] = '577b88d9f5c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return column in [c["name"] for c in inspect(bind).get_columns(table)]


def upgrade() -> None:
    if not column_exists('clinical_findings', 'dentition_type'):
        op.add_column('clinical_findings', sa.Column('dentition_type', sa.String(length=5), nullable=True))
    if not column_exists('clinical_findings', 'surface'):
        op.add_column('clinical_findings', sa.Column('surface', sa.String(length=50), nullable=True))
    if not column_exists('clinical_findings', 'updated_at'):
        op.add_column('clinical_findings', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    for column in ('updated_at', 'surface', 'dentition_type'):
        if column_exists('clinical_findings', column):
            op.drop_column('clinical_findings', column)
