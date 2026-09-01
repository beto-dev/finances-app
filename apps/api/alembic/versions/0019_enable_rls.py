"""Enable Row Level Security on all tables

RLS is enabled with no policies. This blocks anon/authenticated access via
Supabase's Data API (PostgREST) entirely, while the API's own DB connection
(the `postgres` table owner) is unaffected — table owners bypass RLS.

Revision ID: 0019
Revises: 0018
Create Date: 2026-08-27
"""
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None

TABLES = [
    "alembic_version",
    "users",
    "families",
    "family_members",
    "family_contributions",
    "categories",
    "category_rules",
    "category_budgets",
    "statements",
    "charges",
    "credits",
    "google_sheet_configs",
]


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
