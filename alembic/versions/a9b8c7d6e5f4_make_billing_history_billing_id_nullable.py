"""make_billing_history_billing_id_nullable

Revision ID: a9b8c7d6e5f4
Revises: b41d803b8558
Create Date: 2026-06-25 12:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a9b8c7d6e5f4'
down_revision: Union[str, None] = 'b41d803b8558'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('billing_histories_billing_id_fkey', 'billing_histories', type_='foreignkey')
    op.alter_column('billing_histories', 'billing_id',
                    existing_type=sa.String(36),
                    nullable=True)
    op.create_foreign_key('billing_histories_billing_id_fkey', 'billing_histories', 'billings',
                          ['billing_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('billing_histories_billing_id_fkey', 'billing_histories', type_='foreignkey')
    op.alter_column('billing_histories', 'billing_id',
                    existing_type=sa.String(36),
                    nullable=False)
    op.create_foreign_key('billing_histories_billing_id_fkey', 'billing_histories', 'billings',
                          ['billing_id'], ['id'])
