"""remove appointment_type from appointments

Revision ID: a5b6c7d8e9f0
Revises: d7e8f9a0b1c2
Create Date: 2026-08-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a5b6c7d8e9f0'
down_revision = 'd7e8f9a0b1c2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('appointments', 'appointment_type')
    op.execute("DROP TYPE IF EXISTS appointmenttype")


def downgrade() -> None:
    appointment_type = sa.Enum('CONSULTATION', 'FOLLOW_UP', 'TREATMENT', 'EMERGENCY', 'REVIEW', name='appointmenttype')
    appointment_type.create(op.get_bind())
    op.add_column(
        'appointments',
        sa.Column('appointment_type', appointment_type, nullable=False, server_default='CONSULTATION'),
    )
