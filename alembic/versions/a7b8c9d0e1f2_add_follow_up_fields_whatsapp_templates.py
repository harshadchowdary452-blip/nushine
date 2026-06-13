"""add follow_up fields, whatsapp_templates, communication_log follow_up_id

Revision ID: a7b8c9d0e1f2
Revises: 4dc0a00846f8
Create Date: 2026-06-13 23:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect as sa_inspect
import sqlalchemy as sa


revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = '4dc0a00846f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    fu_cols = {c["name"] for c in inspector.get_columns("follow_ups")}
    existing_tables = inspector.get_table_names()

    # -- follow_ups: new fields --
    if "follow_up_type" not in fu_cols:
        op.add_column('follow_ups', sa.Column('follow_up_type', sa.String(length=20), server_default='MANUAL', nullable=False))
    if "treatment_name" not in fu_cols:
        op.add_column('follow_ups', sa.Column('treatment_name', sa.String(length=255), nullable=True))
    if "treatment_completed_date" not in fu_cols:
        op.add_column('follow_ups', sa.Column('treatment_completed_date', sa.Date(), nullable=True))
    if "completed_date" not in fu_cols:
        op.add_column('follow_ups', sa.Column('completed_date', sa.DateTime(timezone=True), nullable=True))
    if "completed_by" not in fu_cols:
        op.add_column('follow_ups', sa.Column('completed_by', sa.String(length=36), nullable=True))
    if "whatsapp_message" not in fu_cols:
        op.add_column('follow_ups', sa.Column('whatsapp_message', sa.Text(), nullable=True))
    if "whatsapp_sent_at" not in fu_cols:
        op.add_column('follow_ups', sa.Column('whatsapp_sent_at', sa.DateTime(timezone=True), nullable=True))
    if "call_made_at" not in fu_cols:
        op.add_column('follow_ups', sa.Column('call_made_at', sa.DateTime(timezone=True), nullable=True))
    if "call_notes" not in fu_cols:
        op.add_column('follow_ups', sa.Column('call_notes', sa.Text(), nullable=True))

    # -- communication_logs: follow_up_id --
    cl_cols = {c["name"] for c in inspector.get_columns("communication_logs")}
    if "follow_up_id" not in cl_cols:
        op.add_column('communication_logs', sa.Column('follow_up_id', sa.String(length=36), nullable=True))

    # -- whatsapp_templates --
    if "whatsapp_templates" not in existing_tables:
        op.create_table('whatsapp_templates',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('hospital_id', sa.String(length=36), nullable=True),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_tables = inspector.get_table_names()

    if "whatsapp_templates" in existing_tables:
        op.drop_table('whatsapp_templates')

    cl_cols = {c["name"] for c in inspector.get_columns("communication_logs")}
    if "follow_up_id" in cl_cols:
        op.drop_column('communication_logs', 'follow_up_id')

    fu_cols = {c["name"] for c in inspector.get_columns("follow_ups")}
    for col in ['call_notes', 'call_made_at', 'whatsapp_sent_at', 'whatsapp_message',
                'completed_by', 'completed_date', 'treatment_completed_date',
                'treatment_name', 'follow_up_type']:
        if col in fu_cols:
            op.drop_column('follow_ups', col)
