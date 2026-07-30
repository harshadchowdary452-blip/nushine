"""Add lead_communication tracking columns that were missed in the chain

Revision ID: e1f2a3b4c5d8
Revises: c5d6e7f8a9b0
Create Date: 2026-07-30
"""
from alembic import op
import sqlalchemy as sa


revision = "e1f2a3b4c5d8"
down_revision = "c5d6e7f8a9b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lead_communications", sa.Column("sent_by_name", sa.String(255), nullable=True))
    op.add_column("lead_communications", sa.Column("template_name", sa.String(255), nullable=True))
    op.add_column("lead_communications", sa.Column("message_preview", sa.String(255), nullable=True))
    op.add_column("lead_communications", sa.Column("delivery_status", sa.String(20), nullable=True))
    op.add_column("lead_communications", sa.Column("provider_message_id", sa.String(255), nullable=True))
    op.add_column("lead_communications", sa.Column("direction", sa.String(20), nullable=False, server_default="OUTGOING"))


def downgrade() -> None:
    op.drop_column("lead_communications", "direction")
    op.drop_column("lead_communications", "provider_message_id")
    op.drop_column("lead_communications", "delivery_status")
    op.drop_column("lead_communications", "message_preview")
    op.drop_column("lead_communications", "template_name")
    op.drop_column("lead_communications", "sent_by_name")
