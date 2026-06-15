"""create_lead_tables

Revision ID: a1b2c3d4e5f7
Revises: f1f7e0578091
Create Date: 2026-06-15 13:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = 'f1f7e0578091'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('leads',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('hospital_id', sa.String(length=36), nullable=False),
        sa.Column('assigned_staff_id', sa.String(length=36), nullable=True),
        sa.Column('assigned_doctor_id', sa.String(length=36), nullable=True),
        sa.Column('converted_patient_id', sa.String(length=36), nullable=True),
        sa.Column('lead_name', sa.String(length=255), nullable=False),
        sa.Column('mobile', sa.String(length=50), nullable=False),
        sa.Column('alternate_mobile', sa.String(length=50), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('age', sa.Integer(), nullable=True),
        sa.Column('gender', sa.String(length=20), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.Column('interested_treatment', sa.String(length=255), nullable=True),
        sa.Column('budget', sa.Float(), nullable=True),
        sa.Column('preferred_visit_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ),
        sa.ForeignKeyConstraint(['assigned_staff_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['assigned_doctor_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['converted_patient_id'], ['patients.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('lead_communications',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('lead_id', sa.String(length=36), nullable=False),
        sa.Column('hospital_id', sa.String(length=36), nullable=True),
        sa.Column('sent_by', sa.String(length=36), nullable=True),
        sa.Column('channel', sa.String(length=20), nullable=False),
        sa.Column('message_type', sa.String(length=40), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('provider_response', sa.Text(), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['lead_id'], ['leads.id'], ),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ),
        sa.ForeignKeyConstraint(['sent_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('lead_calls',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('lead_id', sa.String(length=36), nullable=False),
        sa.Column('called_by', sa.String(length=36), nullable=True),
        sa.Column('outcome', sa.String(length=30), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('follow_up_date', sa.Date(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['lead_id'], ['leads.id'], ),
        sa.ForeignKeyConstraint(['called_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('lead_calls')
    op.drop_table('lead_communications')
    op.drop_table('leads')
