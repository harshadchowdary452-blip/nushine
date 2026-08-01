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


def column_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return column in [c["name"] for c in inspect(bind).get_columns(table)]


def upgrade() -> None:
    case_columns = [
        ('chief_complaint_duration', sa.String(length=100)),
        ('chief_complaint_severity', sa.String(length=50)),
        ('chief_complaint_associated_symptoms', sa.Text()),
        ('hpi', sa.Text()),
        ('personal_history', sa.Text()),
        ('family_history', sa.Text()),
        ('medical_history', sa.Text()),
        ('dental_history', sa.Text()),
        ('extra_oral_examination', sa.Text()),
        ('intra_oral_examination', sa.Text()),
        ('clinical_findings_summary', sa.Text()),
        ('periodontal_examination', sa.Text()),
        ('investigations', sa.Text()),
        ('provisional_diagnosis', sa.Text()),
        ('final_diagnosis', sa.Text()),
        ('treatment_plan_estimated_cost', sa.Float()),
        ('treatment_plan_estimated_visits', sa.Integer()),
        ('doctor_registration_number', sa.String(length=50)),
        ('doctor_specialization', sa.String(length=100)),
    ]
    for name, type_ in case_columns:
        if not column_exists('cases', name):
            op.add_column('cases', sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name in ('doctor_specialization', 'doctor_registration_number', 'treatment_plan_estimated_visits',
                 'treatment_plan_estimated_cost', 'final_diagnosis', 'provisional_diagnosis', 'investigations',
                 'periodontal_examination', 'clinical_findings_summary', 'intra_oral_examination',
                 'extra_oral_examination', 'dental_history', 'medical_history', 'family_history',
                 'personal_history', 'hpi', 'chief_complaint_associated_symptoms', 'chief_complaint_severity',
                 'chief_complaint_duration'):
        if column_exists('cases', name):
            op.drop_column('cases', name)
    # ### end Alembic commands ###
