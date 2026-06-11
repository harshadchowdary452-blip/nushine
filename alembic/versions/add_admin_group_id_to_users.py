"""add admin_group_id to users

Revision ID: add_admin_group_id_to_users
Revises: 28bb6073e58b
Create Date: 2026-06-10 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect as sa_inspect
import sqlalchemy as sa


revision: str = "add_admin_group_id_to_users"
down_revision: Union[str, None] = "28bb6073e58b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("users")]
    if "admin_group_id" not in columns:
        op.add_column("users", sa.Column("admin_group_id", sa.String(length=36), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("users")]
    if "admin_group_id" in columns:
        op.drop_column("users", "admin_group_id")
