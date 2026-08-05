"""add doctor_hospitals membership table

Revision ID: d6e7f8a9b0c1
Revises: b6a9c8d7e6f5
Create Date: 2026-08-05

Per-hospital active state for doctors: a doctor can be active in one hospital
and inactive in another within an admin group. Backfills one membership row per
doctor at their primary hospital (active mirroring users.is_active).
"""

from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, None] = "b6a9c8d7e6f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # users soft-delete columns backing User.is_active (enterprise doctor management)
    op.add_column("users", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("deleted_by", sa.String(length=36), nullable=True))

    op.create_table(
        "doctor_hospitals",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("hospital_id", sa.String(length=36), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["hospital_id"], ["hospitals.id"], ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "hospital_id", name="uq_doctor_hospital_user_hospital"),
    )
    op.create_index("ix_doctor_hospitals_user_id", "doctor_hospitals", ["user_id"])
    op.create_index("ix_doctor_hospitals_hospital_id", "doctor_hospitals", ["hospital_id"])

    bind = op.get_bind()
    uid = getattr(bind.dialect, "name", "")
    if uid == "sqlite":
        def _uuid():
            return str(uuid4())
        conn = bind
        rows = conn.execute(sa.text(
            "SELECT id, hospital_id, is_active FROM users "
            "WHERE role = 'DOCTOR' AND hospital_id IS NOT NULL AND is_deleted = false"
        )).fetchall()
        for rid, hospital_id, is_active in rows:
            now = sa.func.now()
            conn.execute(sa.text(
                "INSERT INTO doctor_hospitals "
                "(id, user_id, hospital_id, is_active, created_at, updated_at) "
                "VALUES (:id, :user_id, :hospital_id, :is_active, now(), now()) "
                "ON CONFLICT (user_id, hospital_id) DO NOTHING"
            ), {"id": _uuid(), "user_id": rid, "hospital_id": hospital_id, "is_active": bool(is_active)})
    else:
        conn = bind
        conn.execute(sa.text(
            "INSERT INTO doctor_hospitals "
            "(id, user_id, hospital_id, is_active, created_at, updated_at) "
            "SELECT gen_random_uuid(), id, hospital_id, is_active, now(), now() "
            "FROM users "
            "WHERE role = 'DOCTOR' AND hospital_id IS NOT NULL AND is_deleted = false "
            "ON CONFLICT (user_id, hospital_id) DO NOTHING"
        ))


def downgrade() -> None:
    op.drop_index("ix_doctor_hospitals_hospital_id", table_name="doctor_hospitals")
    op.drop_index("ix_doctor_hospitals_user_id", table_name="doctor_hospitals")
    op.drop_table("doctor_hospitals")
    op.drop_column("users", "deleted_by")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "is_deleted")
