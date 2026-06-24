"""allow_null_hospital_id_in_templates_and_rules

Revision ID: a7f8e5d3c1b2
Revises: 9391bb45d44d
Create Date: 2026-06-24 20:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a7f8e5d3c1b2'
down_revision: Union[str, None] = '9391bb45d44d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('treatment_templates', 'hospital_id',
               existing_type=sa.String(length=36),
               nullable=True)
    op.alter_column('treatment_follow_up_rules', 'hospital_id',
               existing_type=sa.String(length=36),
               nullable=True)


def downgrade() -> None:
    op.alter_column('treatment_follow_up_rules', 'hospital_id',
               existing_type=sa.String(length=36),
               nullable=False)
    op.alter_column('treatment_templates', 'hospital_id',
               existing_type=sa.String(length=36),
               nullable=False)
