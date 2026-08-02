"""merge all heads

Revision ID: e3f4a5b6c7d0
Revises: ('7a8b9c0d1e2f', 'a1b2c3d4e5f6', 'a2b3c4d5e6f7', 'b5c6d7e8f9a0', 'c1d2e3f4a5b6', 'c4d5e6f7a8b9', 'd1e2f3a4b5c6', 'd4e5f6a7b8c9', 'e1f2a3b4c5d8')
Create Date: 2026-08-02 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op


revision: str = 'e3f4a5b6c7d0'
down_revision: Union[str, Sequence[str], None] = (
    '7a8b9c0d1e2f',
    'a1b2c3d4e5f6',
    'a2b3c4d5e6f7',
    'b5c6d7e8f9a0',
    'c1d2e3f4a5b6',
    'c4d5e6f7a8b9',
    'd1e2f3a4b5c6',
    'd4e5f6a7b8c9',
    'e1f2a3b4c5d8',
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
