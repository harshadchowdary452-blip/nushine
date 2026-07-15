"""add workflow_stage to cases

Revision ID: b2c3d4e5f6a7
Revises: e1f2a3b4c5d7
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6a7"
down_revision = "e1f2a3b4c5d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    workflow_stage_enum = sa.Enum(
        "DRAFT", "TREATMENT_PLANNING", "PENDING_APPROVAL", "APPROVED",
        "DOCTORS_ASSIGNED", "FIRST_APPOINTMENT_SCHEDULED", "TREATMENT_IN_PROGRESS", "COMPLETED",
        name="caseworkflowstage",
    )
    workflow_stage_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "cases",
        sa.Column("workflow_stage", workflow_stage_enum, nullable=False, server_default="DRAFT"),
    )


def downgrade() -> None:
    op.drop_column("cases", "workflow_stage")
    sa.Enum(name="caseworkflowstage").drop(op.get_bind(), checkfirst=True)
