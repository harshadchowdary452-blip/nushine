"""add whatsapp audit fields to communication_logs and message_audits table

Revision ID: a1a2a3a4a5b6
Revises: 9311e1eaa137
Create Date: 2026-06-24 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect as sa_inspect
import sqlalchemy as sa


revision: str = 'a1a2a3a4a5b6'
down_revision: Union[str, None] = '9311e1eaa137'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    cl_cols = {c["name"] for c in inspector.get_columns("communication_logs")}
    existing_tables = inspector.get_table_names()

    for col in ["template_id", "template_name", "rendered_variables", "sent_via", "approved_by"]:
        if col not in cl_cols:
            op.add_column('communication_logs', sa.Column(col, sa.String(length=500) if col in ("template_name",) else sa.Text() if col == "rendered_variables" else sa.String(length=36), nullable=True))

    if "approved_at" not in cl_cols:
        op.add_column('communication_logs', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))

    if "message_audits" not in existing_tables:
        op.create_table('message_audits',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('communication_log_id', sa.String(length=36), sa.ForeignKey('communication_logs.id'), nullable=False),
            sa.Column('patient_id', sa.String(length=36), sa.ForeignKey('patients.id'), nullable=False),
            sa.Column('hospital_id', sa.String(length=36), sa.ForeignKey('hospitals.id'), nullable=True),
            sa.Column('action', sa.String(length=30), nullable=False),
            sa.Column('details', sa.Text(), nullable=True),
            sa.Column('created_by', sa.String(length=36), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_tables = inspector.get_table_names()

    if "message_audits" in existing_tables:
        op.drop_table('message_audits')

    cl_cols = {c["name"] for c in inspector.get_columns("communication_logs")}
    for col in ["template_id", "template_name", "rendered_variables", "sent_via", "approved_by", "approved_at"]:
        if col in cl_cols:
            op.drop_column('communication_logs', col)
