"""add medication_prescriptions table

Revision ID: 99cda1053a5e
Revises: f7e6d5c4b3a2
Create Date: 2026-08-15 00:00:00.000000

Single normalized source of truth for medications shared by
Case Reports (case_id) and Treatment Sittings (treatment_sitting_id).
Legacy free-text columns (cases.medicines_prescribed,
treatment_sittings.prescription) are kept for backward compatibility.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '99cda1053a5e'
down_revision: Union[str, None] = 'f7e6d5c4b3a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(table):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return table in inspect(bind).get_table_names()


def upgrade() -> None:
    if table_exists('medication_prescriptions'):
        return
    op.create_table(
        'medication_prescriptions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('case_id', sa.String(36), sa.ForeignKey('cases.id'), nullable=True),
        sa.Column('treatment_sitting_id', sa.String(36), sa.ForeignKey('treatment_sittings.id'), nullable=True),
        sa.Column('medication_name', sa.String(255), nullable=False),
        sa.Column('dosage', sa.String(100), nullable=True),
        sa.Column('frequency', sa.String(100), nullable=True),
        sa.Column('duration', sa.String(100), nullable=True),
        sa.Column('instructions', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('updated_by_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_medication_prescriptions_case_id', 'medication_prescriptions', ['case_id'])
    op.create_index('ix_medication_prescriptions_treatment_sitting_id', 'medication_prescriptions', ['treatment_sitting_id'])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table('medication_prescriptions'):
        return
    op.drop_index('ix_medication_prescriptions_treatment_sitting_id', table_name='medication_prescriptions', if_exists=True)
    op.drop_index('ix_medication_prescriptions_case_id', table_name='medication_prescriptions', if_exists=True)
    op.drop_table('medication_prescriptions')
