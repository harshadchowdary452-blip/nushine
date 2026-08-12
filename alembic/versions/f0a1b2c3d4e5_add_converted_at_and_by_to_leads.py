"""add_converted_at_and_by_to_leads

Revision ID: f0a1b2c3d4e5
Revises: a5b6c7d8e9f0
Create Date: 2026-08-12 12:00:00.000000

Adds converted_at (indexed) and converted_by to leads so conversion history is
stored on the lead record itself instead of being inferred from updated_at.
Backfills converted_at from updated_at for already-converted leads.
"""
from typing import Union, Sequence
from alembic import op
import sqlalchemy as sa


revision: str = 'f0a1b2c3d4e5'
down_revision: Union[str, None] = 'a5b6c7d8e9f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('leads', sa.Column('converted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('leads', sa.Column('converted_by', sa.String(length=36), nullable=True))
    op.create_index('ix_leads_converted_at', 'leads', ['converted_at'])
    op.execute(
        "UPDATE leads SET converted_at = updated_at "
        "WHERE status = 'CONVERTED' AND converted_at IS NULL"
    )


def downgrade() -> None:
    op.drop_index('ix_leads_converted_at', table_name='leads')
    op.drop_column('leads', 'converted_by')
    op.drop_column('leads', 'converted_at')
