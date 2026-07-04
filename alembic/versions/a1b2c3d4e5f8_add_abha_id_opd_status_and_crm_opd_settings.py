"""add abha_id, opd status and crm_opd_settings

Revision ID: a1b2c3d4e5f8
Revises: f5c02e13602a
Create Date: 2026-07-04 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f8"
down_revision: Union[str, None] = "f5c02e13602a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # ── Add new values to patientstatus enum (PostgreSQL) ──────
    if "patients" in tables and bind.dialect.name == "postgresql":
        existing = {
            r[0] for r in
            bind.execute(sa.text("SELECT unnest(enum_range(NULL::patientstatus))")).all()
        }
        for val in ["INACTIVE", "TREATMENT_ONGOING", "OPD", "LOST", "ARCHIVED"]:
            if val not in existing:
                op.execute(f"ALTER TYPE patientstatus ADD VALUE '{val}'")

    # ── patients: add abha_id, drop diagnosis ──────────────────
    if "patients" in tables:
        cols = [c["name"] for c in inspector.get_columns("patients")]
        if "abha_id" not in cols:
            op.add_column("patients", sa.Column("abha_id", sa.String(20), nullable=True, index=True))
        if "diagnosis" in cols:
            op.drop_column("patients", "diagnosis")

    # ── crm_opd_settings ───────────────────────────────────────
    if "crm_opd_settings" not in tables:
        op.create_table(
            "crm_opd_settings",
            sa.Column("id", sa.String(36), nullable=False),
            sa.Column("hospital_id", sa.String(36), nullable=False),
            sa.Column("opd_follow_up_enabled", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("default_due_days", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("assigned_staff_id", sa.String(36), nullable=True),
            sa.Column("priority", sa.String(20), nullable=False, server_default="MEDIUM"),
            sa.Column("message_template", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            sa.ForeignKeyConstraint(["hospital_id"], ["hospitals.id"], ),
            sa.ForeignKeyConstraint(["assigned_staff_id"], ["users.id"], ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_crm_opd_settings_hospital_id", "crm_opd_settings", ["hospital_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "patients" in tables:
        cols = [c["name"] for c in inspector.get_columns("patients")]
        if "abha_id" in cols:
            op.drop_column("patients", "abha_id")
        if "diagnosis" not in cols:
            op.add_column("patients", sa.Column("diagnosis", sa.Text(), nullable=True))

    if "crm_opd_settings" in tables:
        op.drop_index("ix_crm_opd_settings_hospital_id", table_name="crm_opd_settings")
        op.drop_table("crm_opd_settings")
