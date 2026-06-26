"""add_campaign_templates_table

Revision ID: f5c02e13602a
Revises: 6dd7ea0d565c
Create Date: 2026-06-26 12:27:55.506856

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


revision: str = 'f5c02e13602a'
down_revision: Union[str, None] = '6dd7ea0d565c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_tables = inspector.get_table_names()

    if "campaign_templates" not in existing_tables:
        op.create_table('campaign_templates',
            sa.Column('id', sa.String(36), nullable=False),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('channel', sa.String(30), nullable=False),
            sa.Column('category', sa.String(50), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_by', sa.String(36), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_tables = inspector.get_table_names()

    if "campaign_templates" in existing_tables:
        op.drop_table('campaign_templates')
