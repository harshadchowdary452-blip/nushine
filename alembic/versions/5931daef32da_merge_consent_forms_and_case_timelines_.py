"""merge consent_forms and case_timelines heads

Revision ID: 5931daef32da
Revises: a2b3c4d5e6f7, d1e2f3a4b5c6
Create Date: 2026-06-18 12:00:51.944654

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '5931daef32da'
down_revision: Union[str, None] = ('a2b3c4d5e6f7', 'd1e2f3a4b5c6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
