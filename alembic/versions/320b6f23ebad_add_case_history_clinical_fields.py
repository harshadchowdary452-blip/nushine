"""add case history clinical fields

Revision ID: 320b6f23ebad
Revises: 667f59e07a89
Create Date: 2026-07-04 17:18:44.695482

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '320b6f23ebad'
down_revision: Union[str, None] = '667f59e07a89'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('cases', sa.Column('chief_complaint_duration', sa.String(length=100), nullable=True))
    op.add_column('cases', sa.Column('chief_complaint_severity', sa.String(length=50), nullable=True))
    op.add_column('cases', sa.Column('chief_complaint_associated_symptoms', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('hpi', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('personal_history', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('family_history', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('medical_history', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('dental_history', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('extra_oral_examination', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('intra_oral_examination', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('clinical_findings_summary', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('periodontal_examination', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('investigations', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('provisional_diagnosis', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('final_diagnosis', sa.Text(), nullable=True))
    op.add_column('cases', sa.Column('treatment_plan_estimated_cost', sa.Float(), nullable=True))
    op.add_column('cases', sa.Column('treatment_plan_estimated_visits', sa.Integer(), nullable=True))
    op.add_column('cases', sa.Column('doctor_registration_number', sa.String(length=50), nullable=True))
    op.add_column('cases', sa.Column('doctor_specialization', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('cases', 'doctor_specialization')
    op.drop_column('cases', 'doctor_registration_number')
    op.drop_column('cases', 'treatment_plan_estimated_visits')
    op.drop_column('cases', 'treatment_plan_estimated_cost')
    op.drop_column('cases', 'final_diagnosis')
    op.drop_column('cases', 'provisional_diagnosis')
    op.drop_column('cases', 'investigations')
    op.drop_column('cases', 'periodontal_examination')
    op.drop_column('cases', 'clinical_findings_summary')
    op.drop_column('cases', 'intra_oral_examination')
    op.drop_column('cases', 'extra_oral_examination')
    op.drop_column('cases', 'dental_history')
    op.drop_column('cases', 'medical_history')
    op.drop_column('cases', 'family_history')
    op.drop_column('cases', 'personal_history')
    op.drop_column('cases', 'hpi')
    op.drop_column('cases', 'chief_complaint_associated_symptoms')
    op.drop_column('cases', 'chief_complaint_severity')
    op.drop_column('cases', 'chief_complaint_duration')
    # ### end Alembic commands ###
