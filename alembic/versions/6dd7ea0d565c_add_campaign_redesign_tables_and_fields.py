"""add_campaign_redesign_tables_and_fields

Revision ID: 6dd7ea0d565c
Revises: 6b778d416392
Create Date: 2026-06-26 11:08:08.821922

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '6dd7ea0d565c'
down_revision: Union[str, None] = '6b778d416392'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(table):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return table in inspect(bind).get_table_names()


def column_exists(table, column):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return column in [c["name"] for c in inspect(bind).get_columns(table)]


def index_exists(table, index):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return index in [i["name"] for i in inspect(bind).get_indexes(table)]


def upgrade() -> None:
    # Add new columns to campaigns table
    if not column_exists('campaigns', 'description'):
        op.add_column('campaigns', sa.Column('description', sa.Text(), nullable=True))
    if not column_exists('campaigns', 'scheduled_at'):
        op.add_column('campaigns', sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True))
    if not column_exists('campaigns', 'campaign_cost'):
        op.add_column('campaigns', sa.Column('campaign_cost', sa.Float(), server_default='0.0', nullable=False))
    if not column_exists('campaigns', 'messages_failed'):
        op.add_column('campaigns', sa.Column('messages_failed', sa.Integer(), server_default='0', nullable=False))
    if not column_exists('campaigns', 'interested_count'):
        op.add_column('campaigns', sa.Column('interested_count', sa.Integer(), server_default='0', nullable=False))
    if not column_exists('campaigns', 'patients_converted'):
        op.add_column('campaigns', sa.Column('patients_converted', sa.Integer(), server_default='0', nullable=False))

    # Add new columns to campaign_recipients table
    if not column_exists('campaign_recipients', 'lead_id'):
        op.add_column('campaign_recipients', sa.Column('lead_id', sa.String(36), sa.ForeignKey('leads.id'), nullable=True))
    if not column_exists('campaign_recipients', 'phone'):
        op.add_column('campaign_recipients', sa.Column('phone', sa.String(50), nullable=True))
    if not column_exists('campaign_recipients', 'recipient_name'):
        op.add_column('campaign_recipients', sa.Column('recipient_name', sa.String(255), nullable=True))
    if not column_exists('campaign_recipients', 'delivered_at'):
        op.add_column('campaign_recipients', sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True))
    if not column_exists('campaign_recipients', 'read_at'):
        op.add_column('campaign_recipients', sa.Column('read_at', sa.DateTime(timezone=True), nullable=True))
    if not column_exists('campaign_recipients', 'error_message'):
        op.add_column('campaign_recipients', sa.Column('error_message', sa.Text(), nullable=True))
    if not column_exists('campaign_recipients', 'retry_count'):
        op.add_column('campaign_recipients', sa.Column('retry_count', sa.Integer(), server_default='0', nullable=False))

    # Model uses SAEnum with create_constraint=False (VARCHAR internally), so use String for alter
    op.alter_column('campaign_recipients', 'status',
                    existing_type=sa.String(30),
                    type_=sa.String(50),
                    existing_nullable=False,
                    existing_server_default='PENDING')

    # Create campaign_responses table
    if not table_exists('campaign_responses'):
        op.create_table('campaign_responses',
            sa.Column('id', sa.String(36), nullable=False),
            sa.Column('campaign_id', sa.String(36), sa.ForeignKey('campaigns.id'), nullable=False),
            sa.Column('recipient_id', sa.String(36), sa.ForeignKey('campaign_recipients.id'), nullable=False),
            sa.Column('patient_id', sa.String(36), sa.ForeignKey('patients.id'), nullable=True),
            sa.Column('lead_id', sa.String(36), sa.ForeignKey('leads.id'), nullable=True),
            sa.Column('phone', sa.String(50), nullable=False),
            sa.Column('sender_name', sa.String(255), nullable=True),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('message_type', sa.String(30), server_default='INCOMING', nullable=False),
            sa.Column('response_to', sa.String(36), nullable=True),
            sa.Column('is_read', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('is_lead', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('converted_to_patient', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
    if not index_exists('campaign_responses', 'ix_campaign_responses_campaign_id'):
        op.create_index(op.f('ix_campaign_responses_campaign_id'), 'campaign_responses', ['campaign_id'], unique=False)
    if not index_exists('campaign_responses', 'ix_campaign_responses_recipient_id'):
        op.create_index(op.f('ix_campaign_responses_recipient_id'), 'campaign_responses', ['recipient_id'], unique=False)
    if not index_exists('campaign_responses', 'ix_campaign_responses_phone'):
        op.create_index(op.f('ix_campaign_responses_phone'), 'campaign_responses', ['phone'], unique=False)

    # Create campaign_timelines table
    if not table_exists('campaign_timelines'):
        op.create_table('campaign_timelines',
            sa.Column('id', sa.String(36), nullable=False),
            sa.Column('campaign_id', sa.String(36), sa.ForeignKey('campaigns.id'), nullable=False),
            sa.Column('patient_id', sa.String(36), sa.ForeignKey('patients.id'), nullable=True),
            sa.Column('lead_id', sa.String(36), sa.ForeignKey('leads.id'), nullable=True),
            sa.Column('recipient_id', sa.String(36), sa.ForeignKey('campaign_recipients.id'), nullable=True),
            sa.Column('event_type', sa.String(50), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('metadata_json', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
    if not index_exists('campaign_timelines', 'ix_campaign_timelines_campaign_id'):
        op.create_index(op.f('ix_campaign_timelines_campaign_id'), 'campaign_timelines', ['campaign_id'], unique=False)
    if not index_exists('campaign_timelines', 'ix_campaign_timelines_patient_id'):
        op.create_index(op.f('ix_campaign_timelines_patient_id'), 'campaign_timelines', ['patient_id'], unique=False)


def downgrade() -> None:
    if table_exists('campaign_timelines'):
        op.drop_table('campaign_timelines')
    if table_exists('campaign_responses'):
        op.drop_table('campaign_responses')
    op.alter_column('campaign_recipients', 'status',
                    existing_type=sa.String(50),
                    type_=sa.String(30),
                    existing_nullable=False,
                    existing_server_default='PENDING')
    for name in ('retry_count', 'error_message', 'read_at', 'delivered_at', 'recipient_name', 'phone', 'lead_id'):
        if column_exists('campaign_recipients', name):
            op.drop_column('campaign_recipients', name)
    for name in ('patients_converted', 'interested_count', 'messages_failed', 'campaign_cost', 'scheduled_at', 'description'):
        if column_exists('campaigns', name):
            op.drop_column('campaigns', name)
