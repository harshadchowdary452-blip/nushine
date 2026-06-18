"""create_consent_forms_table

Revision ID: d1e2f3a4b5c6
Revises: 3c1e747bc363
Create Date: 2026-06-18 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = '3c1e747bc363'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('consent_forms',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('patient_id', sa.String(length=36), nullable=True),
        sa.Column('patient_name', sa.String(length=255), nullable=False),
        sa.Column('op_number', sa.String(length=50), nullable=True),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('doctor_id', sa.String(length=36), nullable=True),
        sa.Column('consent_type', sa.String(length=100), nullable=False),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('pdf_path', sa.String(length=500), nullable=False),
        sa.Column('hospital_id', sa.String(length=36), nullable=False),
        sa.Column('uploaded_by', sa.String(length=36), nullable=False),
        sa.Column('case_id', sa.String(length=36), nullable=True),
        sa.Column('treatment_plan_id', sa.String(length=36), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
        sa.ForeignKeyConstraint(['doctor_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ),
        sa.ForeignKeyConstraint(['treatment_plan_id'], ['treatment_plans.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_consent_forms_patient_id'), 'consent_forms', ['patient_id'])
    op.create_index(op.f('ix_consent_forms_doctor_id'), 'consent_forms', ['doctor_id'])
    op.create_index(op.f('ix_consent_forms_hospital_id'), 'consent_forms', ['hospital_id'])
    op.create_index(op.f('ix_consent_forms_case_id'), 'consent_forms', ['case_id'])
    op.create_index(op.f('ix_consent_forms_treatment_plan_id'), 'consent_forms', ['treatment_plan_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_consent_forms_treatment_plan_id'), table_name='consent_forms')
    op.drop_index(op.f('ix_consent_forms_case_id'), table_name='consent_forms')
    op.drop_index(op.f('ix_consent_forms_hospital_id'), table_name='consent_forms')
    op.drop_index(op.f('ix_consent_forms_doctor_id'), table_name='consent_forms')
    op.drop_index(op.f('ix_consent_forms_patient_id'), table_name='consent_forms')
    op.drop_table('consent_forms')
