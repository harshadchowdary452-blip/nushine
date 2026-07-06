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


def upgrade() -> None:
    op.add_column('clinical_findings', sa.Column('dentition_type', sa.String(length=5), nullable=True))
    op.add_column('clinical_findings', sa.Column('surface', sa.String(length=50), nullable=True))
    op.add_column('clinical_findings', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('clinical_findings', 'updated_at')
    op.drop_column('clinical_findings', 'surface')
    op.drop_column('clinical_findings', 'dentition_type')
