"""add follow_up_id to communication_logs

Revision ID: a4b5c6d7e8f0
Revises: b2c3d4e5f6a1
Create Date: 2026-08-15 00:00:00.000000

CommunicationLog never received its follow_up_id column even though
crm.py and whatsapp_v2.py both pass it when creating logs for follow-ups.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a4b5c6d7e8f0'
down_revision: Union[str, None] = 'b2c3d4e5f6a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return column in [c["name"] for c in inspect(bind).get_columns(table)]


def upgrade() -> None:
    if not column_exists('communication_logs', 'follow_up_id'):
        op.add_column('communication_logs', sa.Column('follow_up_id', sa.String(36), nullable=True))
    op.create_index('ix_communication_logs_follow_up_id', 'communication_logs', ['follow_up_id'], if_not_exists=True)
    op.create_foreign_key(None, 'communication_logs', 'follow_ups', ['follow_up_id'], ['id'])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    for fk in insp.get_foreign_keys('communication_logs'):
        if fk.get("constrained_columns") == ['follow_up_id']:
            op.drop_constraint(fk["name"], 'communication_logs', type_='foreignkey')
    op.drop_index('ix_communication_logs_follow_up_id', table_name='communication_logs', if_exists=True)
    if column_exists('communication_logs', 'follow_up_id'):
        op.drop_column('communication_logs', 'follow_up_id')
