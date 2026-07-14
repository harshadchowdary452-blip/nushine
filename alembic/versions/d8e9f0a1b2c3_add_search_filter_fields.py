"""add search filter fields to appointments and patients

Revision ID: d8e9f0a1b2c3
Revises: 739764c784d1
Create Date: 2026-07-14 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd8e9f0a1b2c3'
down_revision: Union[str, None] = '739764c784d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'CHECKED_IN'")
    op.execute("ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'RESCHEDULED'")

    op.add_column('appointments', sa.Column('created_by_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('appointments', sa.Column('updated_by_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True))
    op.create_index('ix_appointments_created_by_id', 'appointments', ['created_by_id'])
    op.create_index('ix_appointments_updated_by_id', 'appointments', ['updated_by_id'])
    op.create_index('ix_appointments_status', 'appointments', ['status'])
    op.create_index('ix_appointments_appointment_type', 'appointments', ['appointment_type'])
    op.create_index('ix_appointments_appointment_date', 'appointments', ['appointment_date'])
    op.create_index('ix_appointments_doctor_id', 'appointments', ['doctor_id'])
    op.create_index('ix_appointments_patient_id', 'appointments', ['patient_id'])

    op.add_column('patients', sa.Column('created_by_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('patients', sa.Column('updated_by_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True))
    op.create_index('ix_patients_created_by_id', 'patients', ['created_by_id'])
    op.create_index('ix_patients_updated_by_id', 'patients', ['updated_by_id'])


def downgrade() -> None:
    op.drop_index('ix_patients_updated_by_id', 'patients')
    op.drop_index('ix_patients_created_by_id', 'patients')
    op.drop_column('patients', 'updated_by_id')
    op.drop_column('patients', 'created_by_id')

    op.drop_index('ix_appointments_patient_id', 'appointments')
    op.drop_index('ix_appointments_doctor_id', 'appointments')
    op.drop_index('ix_appointments_appointment_date', 'appointments')
    op.drop_index('ix_appointments_appointment_type', 'appointments')
    op.drop_index('ix_appointments_status', 'appointments')
    op.drop_index('ix_appointments_updated_by_id', 'appointments')
    op.drop_index('ix_appointments_created_by_id', 'appointments')
    op.drop_column('appointments', 'updated_by_id')
    op.drop_column('appointments', 'created_by_id')
