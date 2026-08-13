"""allow null admin_group_id on hospitals (standalone clinics)

Revision ID: a1b2c3d4e5f0
Revises: f4a5b6c7d8e9
Create Date: 2026-08-13 00:00:00.000000

A hospital may now exist without an admin group so a single clinic can run
standalone (its Hospital Admin acts as the Indent Master). Existing rows keep
their admin_group_id; only the NOT NULL constraint is dropped.
"""
from typing import Union, Sequence
from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f0'
down_revision: Union[str, None] = 'f4a5b6c7d8e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('hospitals', 'admin_group_id',
                    existing_type=sa.String(36), nullable=True)


def downgrade() -> None:
    op.alter_column('hospitals', 'admin_group_id',
                    existing_type=sa.String(36), nullable=False)
