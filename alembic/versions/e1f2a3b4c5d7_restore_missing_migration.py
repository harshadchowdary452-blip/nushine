"""Create stub for missing migration e1f2a3b4c5d7

This migration was referenced by two other migrations but the file was lost.
Since the DB schema already has these changes applied, this is a no-op.

Revision ID: e1f2a3b4c5d7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa


revision = "e1f2a3b4c5d7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
