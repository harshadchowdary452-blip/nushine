"""Add whatsapp_mode to whatsapp_configs

Revision ID: 8df8bbf00a66
Revises: d4e5f6a7b8d0
Create Date: 2026-06-16 14:21:18.842742

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '8df8bbf00a66'
down_revision: Union[str, None] = 'd4e5f6a7b8d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('whatsapp_configs', sa.Column('whatsapp_mode', sa.String(length=20), nullable=True))
    op.execute("UPDATE whatsapp_configs SET whatsapp_mode = 'LIVE' WHERE whatsapp_mode IS NULL")
    op.alter_column('whatsapp_configs', 'whatsapp_mode', nullable=False)


def downgrade() -> None:
    op.drop_column('whatsapp_configs', 'whatsapp_mode')
