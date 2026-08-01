"""Remove campaign module tables

Drops the campaign module tables (campaigns, campaign_recipients,
campaign_responses, campaign_timelines, campaign_templates) that were removed
from the application. Patient-level campaign source tracking fields on the
patients table (source_campaign_name / source_campaign_id / source_campaign_date)
are intentionally retained.

Revision ID: c1d2e3f4a5b6
Revises: f3e2d1c0b9a8
Create Date: 2026-08-01
"""
from alembic import op


revision = "c1d2e3f4a5b6"
down_revision = "f3e2d1c0b9a8"
branch_labels = None
depends_on = None


def table_exists(table):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return table in inspect(bind).get_table_names()


def upgrade():
    for table in [
        "campaign_timelines",
        "campaign_responses",
        "campaign_recipients",
        "campaigns",
        "campaign_templates",
    ]:
        if table_exists(table):
            op.drop_table(table)


def downgrade():
    # Campaign tables are intentionally not recreated; the pre-existing
    # migrations (4dc0a00846f8, 6dd7ea0d565c, f5c02e13602a) define the schema.
    pass
