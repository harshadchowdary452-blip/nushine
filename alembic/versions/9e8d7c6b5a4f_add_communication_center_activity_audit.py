"""add communication center activity audit table

Revision ID: 9e8d7c6b5a4f
Revises: d7e8f9a0b1c2
Create Date: 2026-08-06 00:00:00.000000

Note: this file originally reused revision id e1f2a3b4c5d6 (which already
belonged to the discount/paid_at migration), so alembic silently ignored it
and the communication_center_activities table was never created. The id was
changed to a unique value so the migration can be applied.

"""
from alembic import op
import sqlalchemy as sa

revision = '9e8d7c6b5a4f'
down_revision = 'd7e8f9a0b1c2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'communication_center_activities',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('communication_id', sa.String(36), nullable=False),
        sa.Column('source_module', sa.String(60), nullable=False),
        sa.Column('patient_id', sa.String(36), nullable=True),
        sa.Column('lead_id', sa.String(36), nullable=True),
        sa.Column('hospital_id', sa.String(36), nullable=True),
        sa.Column('action', sa.String(30), nullable=False),
        sa.Column('channel', sa.String(30), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name='fk_cc_activities_created_by'),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], name='fk_cc_activities_hospital'),
        sa.ForeignKeyConstraint(['lead_id'], ['leads.id'], name='fk_cc_activities_lead'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], name='fk_cc_activities_patient'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_cc_activities_communication_id', 'communication_center_activities', ['communication_id'])
    op.create_index('ix_cc_activities_hospital_id', 'communication_center_activities', ['hospital_id'])
    op.create_index('ix_cc_activities_patient_id', 'communication_center_activities', ['patient_id'])
    op.create_index('ix_cc_activities_action', 'communication_center_activities', ['action'])
    op.create_index('ix_cc_activities_created_at', 'communication_center_activities', ['created_at'])


def downgrade() -> None:
    op.drop_table('communication_center_activities')
