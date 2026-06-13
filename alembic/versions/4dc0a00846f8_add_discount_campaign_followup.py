"""add discount, campaign, and follow-up response tables

Revision ID: 4dc0a00846f8
Revises: e6f7a8b9c0d1
Create Date: 2026-06-13 22:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect as sa_inspect
import sqlalchemy as sa


revision: str = '4dc0a00846f8'
down_revision: Union[str, None] = 'e6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_cols = {c["name"] for c in inspector.get_columns("billings")}
    existing_tables = inspector.get_table_names()

    # -- billings: discount columns --
    if "discount_percent" not in existing_cols:
        op.add_column('billings', sa.Column('discount_percent', sa.Float(), server_default='0', nullable=False))
    if "discount_amount" not in existing_cols:
        op.add_column('billings', sa.Column('discount_amount', sa.Float(), server_default='0', nullable=False))
    if "discount_reason" not in existing_cols:
        op.add_column('billings', sa.Column('discount_reason', sa.String(length=255), nullable=True))

    # -- campaigns --
    if "campaigns" not in existing_tables:
        op.create_table('campaigns',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('hospital_id', sa.String(length=36), nullable=True),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('type', sa.String(length=30), nullable=False),
            sa.Column('target_filter', sa.String(length=50), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('scheduled_date', sa.DateTime(timezone=True), nullable=True),
            sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('stats_total', sa.Integer(), server_default='0', nullable=False),
            sa.Column('stats_sent', sa.Integer(), server_default='0', nullable=False),
            sa.Column('stats_opened', sa.Integer(), server_default='0', nullable=False),
            sa.Column('stats_responded', sa.Integer(), server_default='0', nullable=False),
            sa.Column('stats_converted', sa.Integer(), server_default='0', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    # -- campaign_recipients --
    if "campaign_recipients" not in existing_tables:
        op.create_table('campaign_recipients',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('campaign_id', sa.String(length=36), nullable=False),
            sa.Column('patient_id', sa.String(length=36), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('opened_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['campaign_id'], ['campaigns.id'], ),
            sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    # -- follow_up_responses --
    if "follow_up_responses" not in existing_tables:
        op.create_table('follow_up_responses',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('follow_up_id', sa.String(length=36), nullable=False),
            sa.Column('patient_id', sa.String(length=36), nullable=False),
            sa.Column('response_type', sa.String(length=30), nullable=False),
            sa.Column('response', sa.Text(), nullable=True),
            sa.Column('responded_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['follow_up_id'], ['follow_ups.id'], ),
            sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
            sa.PrimaryKeyConstraint('id')
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_cols = {c["name"] for c in inspector.get_columns("billings")}
    existing_tables = inspector.get_table_names()

    if "follow_up_responses" in existing_tables:
        op.drop_table('follow_up_responses')
    if "campaign_recipients" in existing_tables:
        op.drop_table('campaign_recipients')
    if "campaigns" in existing_tables:
        op.drop_table('campaigns')

    if "discount_reason" in existing_cols:
        op.drop_column('billings', 'discount_reason')
    if "discount_amount" in existing_cols:
        op.drop_column('billings', 'discount_amount')
    if "discount_percent" in existing_cols:
        op.drop_column('billings', 'discount_percent')
