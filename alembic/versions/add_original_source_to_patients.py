"""add_original_source_to_patients

Revision ID: add_original_source_to_patients
Revises: add_patient_source_tracking
Create Date: 2026-06-16

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'add_original_source_to_patients'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('patients', sa.Column('original_source', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('patients', 'original_source')
