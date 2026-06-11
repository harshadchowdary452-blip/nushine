"""add_pdf_path_to_billings

Revision ID: f5e8c2d1a4b9
Revises: a934fb8062bc
Create Date: 2026-06-11 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'f5e8c2d1a4b9'
down_revision: Union[str, None] = 'a934fb8062bc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('billings', sa.Column('pdf_path', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('billings', 'pdf_path')
