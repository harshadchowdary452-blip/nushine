"""add subscription tables

Revision ID: 98b6454bf08c
Revises: 44362f20eab0
Create Date: 2026-08-19 11:43:01.692265

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '98b6454bf08c'
down_revision: Union[str, None] = '44362f20eab0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # subscription_plans
    op.create_table('subscription_plans',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('duration_months', sa.Integer(), nullable=False),
        sa.Column('max_hospitals', sa.Integer(), nullable=True),
        sa.Column('max_doctors', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    # subscriptions
    op.create_table('subscriptions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('subscriber_type', sa.Enum('ADMIN_GROUP', 'HOSPITAL', name='subscribertype'), nullable=False),
        sa.Column('subscriber_id', sa.String(length=36), nullable=False),
        sa.Column('plan_id', sa.String(length=36), nullable=False),
        sa.Column('subscription_type', sa.Enum('PAID', 'FREE', 'TRIAL', name='subscriptiontype'), nullable=False),
        sa.Column('status', sa.Enum('TRIAL', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED', name='subscriptionstatus'), nullable=False),
        sa.Column('current_period_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('trial_ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('grace_period_days', sa.Integer(), nullable=False),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancelled_by', sa.String(length=36), nullable=True),
        sa.Column('free_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('free_forever', sa.Boolean(), nullable=False),
        sa.Column('free_reason', sa.Text(), nullable=True),
        sa.Column('free_notes', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['plan_id'], ['subscription_plans.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('subscriber_type', 'subscriber_id', name='uq_subscription_tenant'),
    )
    op.create_index('ix_subscription_status', 'subscriptions', ['status'], unique=False)
    op.create_index('ix_subscription_tenant', 'subscriptions', ['subscriber_type', 'subscriber_id'], unique=False)

    # subscription_events
    op.create_table('subscription_events',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('subscription_id', sa.String(length=36), nullable=False),
        sa.Column('event_type', sa.Enum('CREATED', 'ACTIVATED', 'RENEWED', 'EXTENDED', 'PLAN_CHANGED', 'FREE_GRANTED', 'FREE_EXTENDED', 'CANCELLED', 'REACTIVATED', 'PAYMENT_RECORDED', 'STATUS_CHANGED', name='subscriptioneventtype'), nullable=False),
        sa.Column('previous_plan_id', sa.String(length=36), nullable=True),
        sa.Column('new_plan_id', sa.String(length=36), nullable=True),
        sa.Column('previous_status', sa.Enum('TRIAL', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED', name='subscriptionstatus'), nullable=True),
        sa.Column('new_status', sa.Enum('TRIAL', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED', name='subscriptionstatus'), nullable=True),
        sa.Column('performed_by', sa.String(length=36), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['performed_by'], ['users.id']),
        sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_subscription_event_sub', 'subscription_events', ['subscription_id'], unique=False)

    # subscription_payments
    op.create_table('subscription_payments',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('subscription_id', sa.String(length=36), nullable=False),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('payment_method', sa.Enum('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER', name='paymentmethod'), nullable=False),
        sa.Column('payment_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('reference_number', sa.String(length=255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('recorded_by', sa.String(length=36), nullable=True),
        sa.Column('provider', sa.String(length=50), nullable=True),
        sa.Column('provider_payment_id', sa.String(length=255), nullable=True),
        sa.Column('provider_order_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['recorded_by'], ['users.id']),
        sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_subscription_payment_sub', 'subscription_payments', ['subscription_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_subscription_payment_sub', table_name='subscription_payments')
    op.drop_table('subscription_payments')
    op.drop_index('ix_subscription_event_sub', table_name='subscription_events')
    op.drop_table('subscription_events')
    op.drop_index('ix_subscription_tenant', table_name='subscriptions')
    op.drop_index('ix_subscription_status', table_name='subscriptions')
    op.drop_table('subscriptions')
    op.drop_table('subscription_plans')
