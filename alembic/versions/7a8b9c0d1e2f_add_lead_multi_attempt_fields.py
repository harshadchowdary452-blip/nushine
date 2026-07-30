"""Add multi-attempt fields for lead follow-up automation

Revision ID: 7a8b9c0d1e2f
Revises: 5f1d9d707070
Create Date: 2026-07-30 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "7a8b9c0d1e2f"
down_revision = "5f1d9d707070"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # crm_follow_up_configs — auto-attempt fields
    op.add_column("crm_follow_up_configs", sa.Column("max_attempts", sa.Integer(), nullable=False, server_default=sa.text("3")))
    op.add_column("crm_follow_up_configs", sa.Column("days_between_attempts", sa.Integer(), nullable=False, server_default=sa.text("3")))
    op.add_column("crm_follow_up_configs", sa.Column("auto_close_after_final", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("crm_follow_up_configs", sa.Column("auto_close_action", sa.String(30), nullable=False, server_default=sa.text("'KEEP_OPEN'")))
    op.add_column("crm_follow_up_configs", sa.Column("stop_automation_on", sa.String(100), nullable=False, server_default=sa.text("'CONVERTED,NOT_INTERESTED,LOST'")))

    # generated_enquiries — total_attempts
    op.add_column("generated_enquiries", sa.Column("total_attempts", sa.Integer(), nullable=True))

    # leads — automation tracking
    op.add_column("leads", sa.Column("automation_status", sa.String(20), nullable=False, server_default=sa.text("'ACTIVE'")))
    op.add_column("leads", sa.Column("current_attempt", sa.Integer(), nullable=False, server_default=sa.text("0")))
    op.add_column("leads", sa.Column("total_attempts", sa.Integer(), nullable=True))
    op.add_column("leads", sa.Column("automation_closed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("leads", sa.Column("automation_closed_by", sa.String(36), nullable=True))
    op.add_column("leads", sa.Column("automation_closure_reason", sa.String(50), nullable=True))
    op.create_index(op.f("ix_leads_automation_status"), "leads", ["automation_status"])


def downgrade() -> None:
    op.drop_index(op.f("ix_leads_automation_status"), table_name="leads")
    op.drop_column("leads", "automation_closure_reason")
    op.drop_column("leads", "automation_closed_by")
    op.drop_column("leads", "automation_closed_at")
    op.drop_column("leads", "total_attempts")
    op.drop_column("leads", "current_attempt")
    op.drop_column("leads", "automation_status")
    op.drop_column("generated_enquiries", "total_attempts")
    op.drop_column("crm_follow_up_configs", "stop_automation_on")
    op.drop_column("crm_follow_up_configs", "auto_close_action")
    op.drop_column("crm_follow_up_configs", "auto_close_after_final")
    op.drop_column("crm_follow_up_configs", "days_between_attempts")
    op.drop_column("crm_follow_up_configs", "max_attempts")
