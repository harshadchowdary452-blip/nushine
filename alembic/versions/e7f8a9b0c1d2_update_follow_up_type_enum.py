"""Update follow_up_type values and increase column length

Revision ID: e7f8a9b0c1d2
Revises: 5a4cc7c861eb
Create Date: 2026-06-14

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, None] = "5a4cc7c861eb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Increase column length to accommodate "1_DAY_POST_TREATMENT" (20 chars)
    op.alter_column("follow_ups", "follow_up_type", type_=sa.String(30), existing_type=sa.String(20))

    # Migrate old follow_up_type values to new enum values
    # "TREATMENT_CREATED" -> "MANUAL" (legacy, no longer auto-created)
    op.execute("UPDATE follow_ups SET follow_up_type = 'MANUAL' WHERE follow_up_type = 'TREATMENT_CREATED'")
    # "TREATMENT_UPDATED" -> "MANUAL"
    op.execute("UPDATE follow_ups SET follow_up_type = 'MANUAL' WHERE follow_up_type = 'TREATMENT_UPDATED'")
    # "NEXT_SITTING" -> "MANUAL"
    op.execute("UPDATE follow_ups SET follow_up_type = 'MANUAL' WHERE follow_up_type = 'NEXT_SITTING'")
    # "ONE_DAY" -> "1_DAY_POST_TREATMENT"
    op.execute("UPDATE follow_ups SET follow_up_type = '1_DAY_POST_TREATMENT' WHERE follow_up_type = 'ONE_DAY'")
    # "TREATMENT_COMPLETION" -> "1_DAY_POST_TREATMENT"
    op.execute("UPDATE follow_ups SET follow_up_type = '1_DAY_POST_TREATMENT' WHERE follow_up_type = 'TREATMENT_COMPLETION'")


def downgrade():
    op.execute("UPDATE follow_ups SET follow_up_type = 'ONE_DAY' WHERE follow_up_type = '1_DAY_POST_TREATMENT'")
    op.execute("UPDATE follow_ups SET follow_up_type = 'MANUAL' WHERE follow_up_type = '1_DAY_POST_TREATMENT'")
    op.alter_column("follow_ups", "follow_up_type", type_=sa.String(20), existing_type=sa.String(30))
