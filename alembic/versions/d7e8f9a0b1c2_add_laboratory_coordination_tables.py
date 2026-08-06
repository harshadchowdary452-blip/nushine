"""add laboratory coordination tables

Revision ID: d7e8f9a0b1c2
Revises: b0c1d2e3f4a5
Create Date: 2026-08-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'd7e8f9a0b1c2'
down_revision = 'b0c1d2e3f4a5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'laboratories',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('code', sa.String(50), nullable=True),
        sa.Column('contact_person', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('whatsapp_number', sa.String(50), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='ACTIVE'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name='fk_laboratories_created_by'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_laboratories_name', 'laboratories', ['name'], unique=True)
    op.create_index('ix_laboratories_status', 'laboratories', ['status'])

    op.create_table(
        'lab_cases',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('treatment_plan_id', sa.String(36), nullable=False),
        sa.Column('laboratory_id', sa.String(36), nullable=True),
        sa.Column('lab_status', sa.String(30), nullable=False, server_default='PENDING'),
        sa.Column('order_number', sa.String(100), nullable=True),
        sa.Column('tooth_number', sa.String(255), nullable=True),
        sa.Column('material', sa.String(255), nullable=True),
        sa.Column('sent_date', sa.Date(), nullable=True),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('returned_date', sa.Date(), nullable=True),
        sa.Column('lab_cost', sa.Float(), nullable=True),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name='fk_lab_cases_created_by'),
        sa.ForeignKeyConstraint(['laboratory_id'], ['laboratories.id'], name='fk_lab_cases_laboratory'),
        sa.ForeignKeyConstraint(['treatment_plan_id'], ['treatment_plans.id'], name='fk_lab_cases_treatment_plan'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_lab_cases_treatment_plan_id', 'lab_cases', ['treatment_plan_id'], unique=True)
    op.create_index('ix_lab_cases_laboratory_id', 'lab_cases', ['laboratory_id'])
    op.create_index('ix_lab_cases_lab_status', 'lab_cases', ['lab_status'])

    op.create_table(
        'lab_case_events',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('lab_case_id', sa.String(36), nullable=False),
        sa.Column('event_type', sa.String(30), nullable=False),
        sa.Column('from_status', sa.String(30), nullable=True),
        sa.Column('to_status', sa.String(30), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('actor_id', sa.String(36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], name='fk_lab_case_events_actor'),
        sa.ForeignKeyConstraint(['lab_case_id'], ['lab_cases.id'], name='fk_lab_case_events_lab_case'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_lab_case_events_lab_case_id', 'lab_case_events', ['lab_case_id'])


def downgrade() -> None:
    op.drop_table('lab_case_events')
    op.drop_table('lab_cases')
    op.drop_table('laboratories')
