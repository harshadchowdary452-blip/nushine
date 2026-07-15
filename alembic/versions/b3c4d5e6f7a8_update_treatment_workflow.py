"""Update treatment workflow: add GENERATED status, clinical fields, case-level approval

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-07-15

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'b3c4d5e6f7a8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add GENERATED to treatment_plan status enum
    # For SQLite, we need to handle enum changes differently
    op.execute("UPDATE treatment_plans SET status = 'GENERATED' WHERE status = 'PLANNED'")
    
    # 2. Add new columns to treatment_sittings for clinical visit notes
    with op.batch_alter_table('treatment_sittings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('procedure_performed', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('clinical_notes', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('prescription', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('next_visit_required', sa.Boolean(), nullable=False, server_default='1'))
        batch_op.add_column(sa.Column('images_json', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('digital_signature_url', sa.String(500), nullable=True))
        batch_op.add_column(sa.Column('lab_tracking_status', sa.String(50), nullable=True))
        batch_op.add_column(sa.Column('lab_tracking_notes', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('lab_tracking_due_date', sa.Date(), nullable=True))

    # 3. Add case-level treatment plan approval fields
    with op.batch_alter_table('cases', schema=None) as batch_op:
        batch_op.add_column(sa.Column('treatment_plan_status', sa.String(20), nullable=False, server_default='DRAFT'))
        batch_op.add_column(sa.Column('treatment_plan_rejection_reason', sa.Text(), nullable=True))

    # 4. Remove approval fields from treatment_plan_items (they move to case level)
    with op.batch_alter_table('treatment_plan_items', schema=None) as batch_op:
        batch_op.drop_column('is_approved')
        batch_op.drop_column('approved_by_id')
        batch_op.drop_column('approved_at')
        batch_op.drop_column('is_rejected')
        batch_op.drop_column('rejected_by_id')
        batch_op.drop_column('rejected_at')
        batch_op.drop_column('rejection_reason')


def downgrade() -> None:
    # 1. Add back approval fields to treatment_plan_items
    with op.batch_alter_table('treatment_plan_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('rejection_reason', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('rejected_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('rejected_by_id', sa.String(36), nullable=True))
        batch_op.add_column(sa.Column('is_rejected', sa.Boolean(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('approved_by_id', sa.String(36), nullable=True))
        batch_op.add_column(sa.Column('is_approved', sa.Boolean(), nullable=False, server_default='0'))

    # 2. Remove case-level approval fields
    with op.batch_alter_table('cases', schema=None) as batch_op:
        batch_op.drop_column('treatment_plan_rejection_reason')
        batch_op.drop_column('treatment_plan_status')

    # 3. Remove clinical fields from treatment_sittings
    with op.batch_alter_table('treatment_sittings', schema=None) as batch_op:
        batch_op.drop_column('lab_tracking_due_date')
        batch_op.drop_column('lab_tracking_notes')
        batch_op.drop_column('lab_tracking_status')
        batch_op.drop_column('digital_signature_url')
        batch_op.drop_column('images_json')
        batch_op.drop_column('next_visit_required')
        batch_op.drop_column('prescription')
        batch_op.drop_column('clinical_notes')
        batch_op.drop_column('procedure_performed')
