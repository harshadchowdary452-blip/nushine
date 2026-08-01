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


def column_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return column in [c["name"] for c in inspect(bind).get_columns(table)]


def index_exists(table, index):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return index in [i["name"] for i in inspect(bind).get_indexes(table)]


def upgrade() -> None:
    op.execute("ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'CHECKED_IN'")
    op.execute("ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'RESCHEDULED'")

    if not column_exists('appointments', 'created_by_id'):
        op.add_column('appointments', sa.Column('created_by_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True))
    if not column_exists('appointments', 'updated_by_id'):
        op.add_column('appointments', sa.Column('updated_by_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True))
    for idx, col in (('ix_appointments_created_by_id', 'created_by_id'),
                     ('ix_appointments_updated_by_id', 'updated_by_id'),
                     ('ix_appointments_status', 'status'),
                     ('ix_appointments_appointment_type', 'appointment_type'),
                     ('ix_appointments_appointment_date', 'appointment_date'),
                     ('ix_appointments_doctor_id', 'doctor_id'),
                     ('ix_appointments_patient_id', 'patient_id')):
        if not index_exists('appointments', idx):
            op.create_index(idx, 'appointments', [col])

    if not column_exists('patients', 'created_by_id'):
        op.add_column('patients', sa.Column('created_by_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True))
    if not column_exists('patients', 'updated_by_id'):
        op.add_column('patients', sa.Column('updated_by_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True))
    for idx, col in (('ix_patients_created_by_id', 'created_by_id'),
                     ('ix_patients_updated_by_id', 'updated_by_id')):
        if not index_exists('patients', idx):
            op.create_index(idx, 'patients', [col])


def downgrade() -> None:
    if index_exists('patients', 'ix_patients_updated_by_id'):
        op.drop_index('ix_patients_updated_by_id', 'patients')
    if index_exists('patients', 'ix_patients_created_by_id'):
        op.drop_index('ix_patients_created_by_id', 'patients')
    if column_exists('patients', 'updated_by_id'):
        op.drop_column('patients', 'updated_by_id')
    if column_exists('patients', 'created_by_id'):
        op.drop_column('patients', 'created_by_id')

    for idx in ('ix_appointments_patient_id', 'ix_appointments_doctor_id', 'ix_appointments_appointment_date',
                'ix_appointments_appointment_type', 'ix_appointments_status', 'ix_appointments_updated_by_id',
                'ix_appointments_created_by_id'):
        if index_exists('appointments', idx):
            op.drop_index(idx, 'appointments')
    if column_exists('appointments', 'updated_by_id'):
        op.drop_column('appointments', 'updated_by_id')
    if column_exists('appointments', 'created_by_id'):
        op.drop_column('appointments', 'created_by_id')
