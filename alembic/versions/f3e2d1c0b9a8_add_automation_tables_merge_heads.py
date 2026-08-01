"""Add CRM automation engine tables and merge migration heads

Creates the automation execution engine tables (actions, conditions, logs,
versions, execution queue) and the enhanced automation_rules columns that were
applied directly to the database, and merges the six outstanding migration
heads into a single linear head.

Revision ID: f3e2d1c0b9a8
Revises: 7a8b9c0d1e2f, a1b2c3d4e5f6, b5c6d7e8f9a0, c4d5e6f7a8b9, d4e5f6a7b8c9, e1f2a3b4c5d8
Create Date: 2026-08-01
"""
from alembic import op
import sqlalchemy as sa


revision = "f3e2d1c0b9a8"
down_revision = ("7a8b9c0d1e2f", "a1b2c3d4e5f6", "b5c6d7e8f9a0", "c4d5e6f7a8b9", "d4e5f6a7b8c9", "e1f2a3b4c5d8")
branch_labels = None
depends_on = None


def table_exists(table):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return table in inspect(bind).get_table_names()


def column_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return column in [c["name"] for c in inspect(bind).get_columns(table)]


def index_exists(table, index):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return index in [i["name"] for i in inspect(bind).get_indexes(table)]


ENHANCED_RULE_COLUMNS = [
    sa.Column("description", sa.Text(), nullable=True),
    sa.Column("group_id", sa.String(36), nullable=True),
    sa.Column("version", sa.Integer(), nullable=True, server_default=sa.text("1")),
    sa.Column("created_by", sa.String(36), nullable=True),
    sa.Column("modified_by", sa.String(36), nullable=True),
    sa.Column("is_system_rule", sa.Boolean(), nullable=True, server_default=sa.text("false")),
    sa.Column("allow_override", sa.Boolean(), nullable=True, server_default=sa.text("true")),
    sa.Column("condition_logic", sa.String(10), nullable=True, server_default=sa.text("'AND'")),
    sa.Column("escalation_enabled", sa.Boolean(), nullable=True, server_default=sa.text("false")),
    sa.Column("escalation_days_1", sa.Integer(), nullable=True),
    sa.Column("escalation_role_1", sa.String(30), nullable=True),
    sa.Column("escalation_days_2", sa.Integer(), nullable=True),
    sa.Column("escalation_role_2", sa.String(30), nullable=True),
    sa.Column("escalation_days_3", sa.Integer(), nullable=True),
    sa.Column("escalation_role_3", sa.String(30), nullable=True),
    sa.Column("business_hours_only", sa.Boolean(), nullable=True, server_default=sa.text("false")),
    sa.Column("weekend_handling", sa.String(20), nullable=True, server_default=sa.text("'SKIP'")),
    sa.Column("timezone", sa.String(50), nullable=True, server_default=sa.text("'UTC'")),
    sa.Column("execution_count", sa.Integer(), nullable=True, server_default=sa.text("0")),
    sa.Column("success_count", sa.Integer(), nullable=True, server_default=sa.text("0")),
    sa.Column("failure_count", sa.Integer(), nullable=True, server_default=sa.text("0")),
    sa.Column("last_executed_at", sa.DateTime(timezone=True), nullable=True),
]


def upgrade() -> None:
    # automation_rules: the base table exists in some environments (created via
    # direct SQL) and not in others, so create it idempotently and then ensure
    # the enhanced columns/indexes exist.
    if not table_exists("automation_rules"):
        op.create_table(
            "automation_rules",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("hospital_id", sa.String(36), sa.ForeignKey("hospitals.id"), nullable=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("trigger_event", sa.String(50), nullable=False),
            sa.Column("procedure", sa.String(255), nullable=True),
            sa.Column("delay_days", sa.Integer(), nullable=True, server_default=sa.text("0")),
            sa.Column("channel", sa.String(20), nullable=False, server_default=sa.text("'WHATSAPP'")),
            sa.Column("priority", sa.String(10), nullable=False, server_default=sa.text("'MEDIUM'")),
            sa.Column("assigned_role", sa.String(30), nullable=True),
            sa.Column("template_id", sa.String(36), sa.ForeignKey("follow_up_templates.id"), nullable=True),
            sa.Column("message_template", sa.Text(), nullable=True),
            sa.Column("repeat_count", sa.Integer(), nullable=True, server_default=sa.text("1")),
            sa.Column("max_attempts", sa.Integer(), nullable=True, server_default=sa.text("3")),
            sa.Column("stop_conditions", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
            *ENHANCED_RULE_COLUMNS,
        )
    for col in ENHANCED_RULE_COLUMNS:
        if not column_exists("automation_rules", col.name):
            op.add_column("automation_rules", col)
    if not index_exists("automation_rules", "ix_automation_rules_hospital_id"):
        op.create_index("ix_automation_rules_hospital_id", "automation_rules", ["hospital_id"], unique=False)
    if not index_exists("automation_rules", "ix_automation_rules_group_id"):
        op.create_index("ix_automation_rules_group_id", "automation_rules", ["group_id"], unique=False)

    if not table_exists("automation_rule_actions"):
        op.create_table(
            "automation_rule_actions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("rule_id", sa.String(36), sa.ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False),
            sa.Column("action_type", sa.String(50), nullable=False),
            sa.Column("action_config", sa.Text(), nullable=True),
            sa.Column("delay_days", sa.Integer(), nullable=True),
            sa.Column("delay_hours", sa.Integer(), nullable=True),
            sa.Column("responsible_role", sa.String(30), nullable=True),
            sa.Column("priority", sa.String(10), nullable=True),
            sa.Column("max_retries", sa.Integer(), nullable=True),
            sa.Column("retry_delay_hours", sa.Integer(), nullable=True),
            sa.Column("business_hours_only", sa.Boolean(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
    if not index_exists("automation_rule_actions", "ix_automation_rule_actions_rule_id"):
        op.create_index("ix_automation_rule_actions_rule_id", "automation_rule_actions", ["rule_id"], unique=False)

    if not table_exists("automation_rule_conditions"):
        op.create_table(
            "automation_rule_conditions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("rule_id", sa.String(36), sa.ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False),
            sa.Column("field_name", sa.String(100), nullable=False),
            sa.Column("operator", sa.String(20), nullable=False),
            sa.Column("value", sa.Text(), nullable=True),
            sa.Column("value_type", sa.String(20), nullable=True),
            sa.Column("group_key", sa.String(50), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
    if not index_exists("automation_rule_conditions", "ix_automation_rule_conditions_rule_id"):
        op.create_index("ix_automation_rule_conditions_rule_id", "automation_rule_conditions", ["rule_id"], unique=False)

    if not table_exists("automation_rule_logs"):
        op.create_table(
            "automation_rule_logs",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("rule_id", sa.String(36), sa.ForeignKey("automation_rules.id", ondelete="SET NULL"), nullable=True),
            sa.Column("event_type", sa.String(50), nullable=False),
            sa.Column("entity_type", sa.String(50), nullable=True),
            sa.Column("entity_id", sa.String(36), nullable=True),
            sa.Column("hospital_id", sa.String(36), nullable=True),
            sa.Column("patient_id", sa.String(36), nullable=True),
            sa.Column("triggered_by", sa.String(36), nullable=True),
            sa.Column("action_type", sa.String(50), nullable=True),
            sa.Column("action_result", sa.Text(), nullable=True),
            sa.Column("execution_status", sa.String(20), nullable=False),
            sa.Column("execution_time_ms", sa.Float(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("conditions_matched", sa.Text(), nullable=True),
            sa.Column("is_test", sa.String(1), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
    if not index_exists("automation_rule_logs", "ix_automation_rule_logs_rule_id"):
        op.create_index("ix_automation_rule_logs_rule_id", "automation_rule_logs", ["rule_id"], unique=False)
    if not index_exists("automation_rule_logs", "ix_automation_rule_logs_hospital_id"):
        op.create_index("ix_automation_rule_logs_hospital_id", "automation_rule_logs", ["hospital_id"], unique=False)

    if not table_exists("automation_rule_versions"):
        op.create_table(
            "automation_rule_versions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("rule_id", sa.String(36), sa.ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("rule_snapshot", sa.Text(), nullable=False),
            sa.Column("change_summary", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(36), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
    if not index_exists("automation_rule_versions", "ix_automation_rule_versions_rule_id"):
        op.create_index("ix_automation_rule_versions_rule_id", "automation_rule_versions", ["rule_id"], unique=False)

    if not table_exists("automation_execution_queue"):
        op.create_table(
            "automation_execution_queue",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("rule_id", sa.String(36), sa.ForeignKey("automation_rules.id", ondelete="SET NULL"), nullable=True),
            sa.Column("action_id", sa.String(36), sa.ForeignKey("automation_rule_actions.id", ondelete="SET NULL"), nullable=True),
            sa.Column("event_type", sa.String(50), nullable=False),
            sa.Column("entity_type", sa.String(50), nullable=True),
            sa.Column("entity_id", sa.String(36), nullable=True),
            sa.Column("hospital_id", sa.String(36), nullable=True),
            sa.Column("patient_id", sa.String(36), nullable=True),
            sa.Column("action_type", sa.String(50), nullable=False),
            sa.Column("action_config", sa.Text(), nullable=True),
            sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("execute_after", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("priority", sa.String(10), nullable=True),
            sa.Column("retry_count", sa.Integer(), nullable=True),
            sa.Column("max_retries", sa.Integer(), nullable=True),
            sa.Column("retry_delay_hours", sa.Integer(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("result", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        )
    for index, cols in (
        ("ix_automation_execution_queue_rule_id", ["rule_id"]),
        ("ix_automation_execution_queue_hospital_id", ["hospital_id"]),
        ("ix_automation_execution_queue_scheduled_at", ["scheduled_at"]),
        ("ix_automation_execution_queue_status", ["status"]),
    ):
        if not index_exists("automation_execution_queue", index):
            op.create_index(index, "automation_execution_queue", cols, unique=False)


def downgrade() -> None:
    for table in ("automation_rule_actions", "automation_rule_conditions", "automation_rule_logs", "automation_rule_versions", "automation_execution_queue"):
        if table_exists(table):
            op.drop_table(table)
    for col in ENHANCED_RULE_COLUMNS:
        if column_exists("automation_rules", col.name):
            op.drop_column("automation_rules", col.name)
    for index in ("ix_automation_rules_group_id", "ix_automation_rules_hospital_id"):
        if index_exists("automation_rules", index):
            op.drop_index(index, table_name="automation_rules")
