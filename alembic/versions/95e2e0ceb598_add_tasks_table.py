"""add tasks table

Revision ID: 95e2e0ceb598
Revises: e3f4a5b6c7d1
Create Date: 2026-08-02 13:18:11.723251

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '95e2e0ceb598'
down_revision: Union[str, None] = 'e3f4a5b6c7d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('tasks',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('hospital_id', sa.String(length=36), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=False),
        sa.Column('assignee_id', sa.String(length=36), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('priority', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('entity_type', sa.String(length=40), nullable=True),
        sa.Column('entity_id', sa.String(length=36), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['assignee_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('tasks')
