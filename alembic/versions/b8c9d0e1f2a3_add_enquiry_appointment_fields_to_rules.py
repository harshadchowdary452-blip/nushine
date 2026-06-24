"""add_enquiry_appointment_fields_to_rules

Revision ID: b8c9d0e1f2a3
Revises: a7f8e5d3c1b2
Create Date: 2026-06-24 22:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7f8e5d3c1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('treatment_follow_up_rules', sa.Column('enquiry_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('treatment_follow_up_rules', sa.Column('auto_appointment_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('treatment_follow_up_rules', sa.Column('assigned_doctor_id', sa.String(length=36), nullable=True))
    op.create_foreign_key('fk_rules_assigned_doctor', 'treatment_follow_up_rules', 'users', ['assigned_doctor_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_rules_assigned_doctor', 'treatment_follow_up_rules', type_='foreignkey')
    op.drop_column('treatment_follow_up_rules', 'assigned_doctor_id')
    op.drop_column('treatment_follow_up_rules', 'auto_appointment_enabled')
    op.drop_column('treatment_follow_up_rules', 'enquiry_enabled')
