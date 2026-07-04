"""create patient_timelines table

Revision ID: b1c2d3e4f5a6
Revises: a1b2c3d4e5f8
Create Date: 2026-07-04 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "a1b2c3d4e5f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "patient_timelines",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("action", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("module", sa.String(50), nullable=True),
        sa.Column("performed_by", sa.String(36), nullable=True),
        sa.Column("user_name", sa.String(255), nullable=True),
        sa.Column("user_role", sa.String(50), nullable=True),
        sa.Column("hospital_id", sa.String(36), nullable=True),
        sa.Column("hospital_name", sa.String(255), nullable=True),
        sa.Column("changes", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ),
        sa.ForeignKeyConstraint(["performed_by"], ["users.id"], ),
        sa.ForeignKeyConstraint(["hospital_id"], ["hospitals.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_patient_timelines_patient_id", "patient_timelines", ["patient_id"])
    op.create_index("ix_patient_timelines_module", "patient_timelines", ["module"])
    op.create_index("ix_patient_timelines_created_at", "patient_timelines", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_patient_timelines_created_at", table_name="patient_timelines")
    op.drop_index("ix_patient_timelines_module", table_name="patient_timelines")
    op.drop_index("ix_patient_timelines_patient_id", table_name="patient_timelines")
    op.drop_table("patient_timelines")
