"""add_patient_source_tracking

Revision ID: add_patient_source_tracking
Revises: 0767fec3b6f7
Create Date: 2026-06-14

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'add_patient_source_tracking'
down_revision: Union[str, None] = '0767fec3b6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('patients', sa.Column('patient_source', sa.String(length=100), nullable=True))
    op.create_index('ix_patients_patient_source', 'patients', ['patient_source'])
    op.add_column('patients', sa.Column('source_campaign_name', sa.String(length=255), nullable=True))
    op.add_column('patients', sa.Column('source_campaign_id', sa.String(length=100), nullable=True))
    op.add_column('patients', sa.Column('source_campaign_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_index('ix_patients_patient_source', table_name='patients')
    op.drop_column('patients', 'source_campaign_date')
    op.drop_column('patients', 'source_campaign_id')
    op.drop_column('patients', 'source_campaign_name')
    op.drop_column('patients', 'patient_source')
