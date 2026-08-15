"""merge main chain head and communication center branch

Revision ID: f7e6d5c4b3a2
Revises: a4b5c6d7e8f0, 9e8d7c6b5a4f
Create Date: 2026-08-15 00:00:00.000000

Merges the previously detached communication_center_activities branch
(9e8d7c6b5a4f) back into the main migration chain so that `alembic upgrade head`
reaches a single head.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'f7e6d5c4b3a2'
down_revision: Union[str, Sequence[str], None] = ('a4b5c6d7e8f0', '9e8d7c6b5a4f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
