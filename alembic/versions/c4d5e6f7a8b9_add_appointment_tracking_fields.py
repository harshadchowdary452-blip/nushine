"""Add appointment reschedule/cancel/complete tracking fields

Revision ID: c4d5e6f7a8b9
Revises: d8e9f0a1b2c3
Create Date: 2025-07-15

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, None] = 'd8e9f0a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    cols = [c["name"] for c in inspector.get_columns(table)]
    return column in cols


def upgrade() -> None:
    if not column_exists('appointments', 'previous_date'):
        op.add_column('appointments', sa.Column('previous_date', sa.Date(), nullable=True))
    if not column_exists('appointments', 'previous_time'):
        op.add_column('appointments', sa.Column('previous_time', sa.Time(), nullable=True))
    if not column_exists('appointments', 'rescheduled_by_id'):
        op.add_column('appointments', sa.Column('rescheduled_by_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True))
    if not column_exists('appointments', 'rescheduled_at'):
        op.add_column('appointments', sa.Column('rescheduled_at', sa.DateTime(timezone=True), nullable=True))
    if not column_exists('appointments', 'reschedule_reason'):
        op.add_column('appointments', sa.Column('reschedule_reason', sa.Text(), nullable=True))
    if not column_exists('appointments', 'cancelled_by_id'):
        op.add_column('appointments', sa.Column('cancelled_by_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True))
    if not column_exists('appointments', 'cancelled_at'):
        op.add_column('appointments', sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True))
    if not column_exists('appointments', 'cancellation_reason'):
        op.add_column('appointments', sa.Column('cancellation_reason', sa.Text(), nullable=True))
    if not column_exists('appointments', 'completed_by_id'):
        op.add_column('appointments', sa.Column('completed_by_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True))
    if not column_exists('appointments', 'completed_at'):
        op.add_column('appointments', sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('appointments', 'completed_at')
    op.drop_column('appointments', 'completed_by_id')
    op.drop_column('appointments', 'cancellation_reason')
    op.drop_column('appointments', 'cancelled_at')
    op.drop_column('appointments', 'cancelled_by_id')
    op.drop_column('appointments', 'reschedule_reason')
    op.drop_column('appointments', 'rescheduled_at')
    op.drop_column('appointments', 'rescheduled_by_id')
    op.drop_column('appointments', 'previous_time')
    op.drop_column('appointments', 'previous_date')
