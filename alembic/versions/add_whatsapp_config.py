"""Add WhatsApp config table

Revision ID: e5f6a7b8c9d0
Revises: abcd1234efgh
Create Date: 2026-06-15 14:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "abcd1234efgh"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_configs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("hospital_id", sa.String(36), nullable=False, unique=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("clinic_whatsapp_number", sa.String(20), nullable=True),
        sa.Column("country_code", sa.String(5), nullable=False, server_default=sa.text("'+91'")),
        sa.Column("default_message_templates_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("broadcast_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("campaign_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("whatsapp_configs")
