"""add_demo_requests_table

Revision ID: 44362f20eab0
Revises: 99cda1053a5e
Create Date: 2026-08-17 22:34:33.649381

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '44362f20eab0'
down_revision: Union[str, None] = '99cda1053a5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('demo_requests',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=False),
        sa.Column('organization', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('role', sa.String(length=100), nullable=True),
        sa.Column('num_hospitals', sa.String(length=50), nullable=True),
        sa.Column('num_doctors', sa.String(length=50), nullable=True),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('preferred_date', sa.String(length=50), nullable=True),
        sa.Column('preferred_time', sa.String(length=50), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('assigned_to', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['assigned_to'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_demo_requests_status', 'demo_requests', ['status'], unique=False)
    op.create_index('ix_demo_requests_created_at', 'demo_requests', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_demo_requests_created_at', table_name='demo_requests')
    op.drop_index('ix_demo_requests_status', table_name='demo_requests')
    op.drop_table('demo_requests')
