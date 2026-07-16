"""Add ClinicalProgressNote table, severity/doctor to findings, reason_for_change to items, update enums

Revision ID: c5d6e7f8a9b0
Revises: b3c4d5e6f7a8
Create Date: 2026-07-16

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'c5d6e7f8a9b0'
down_revision = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create clinical_progress_notes table
    op.create_table(
        'clinical_progress_notes',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('case_id', sa.String(36), sa.ForeignKey('cases.id'), nullable=False, index=True),
        sa.Column('doctor_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('note_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('clinical_note', sa.Text(), nullable=False),
        sa.Column('attachments_json', sa.Text(), nullable=True),
        sa.Column('digital_signature_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    # 2. Add severity and doctor_id to clinical_findings
    with op.batch_alter_table('clinical_findings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('severity', sa.String(50), nullable=True))
        batch_op.add_column(sa.Column('doctor_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True))

    # 3. Add reason_for_change to treatment_plan_items
    with op.batch_alter_table('treatment_plan_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('reason_for_change', sa.Text(), nullable=True))


def downgrade() -> None:
    # 3. Remove reason_for_change from treatment_plan_items
    with op.batch_alter_table('treatment_plan_items', schema=None) as batch_op:
        batch_op.drop_column('reason_for_change')

    # 2. Remove severity and doctor_id from clinical_findings
    with op.batch_alter_table('clinical_findings', schema=None) as batch_op:
        batch_op.drop_column('doctor_id')
        batch_op.drop_column('severity')

    # 1. Drop clinical_progress_notes table
    op.drop_table('clinical_progress_notes')
