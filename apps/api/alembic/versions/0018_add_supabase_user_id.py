"""Add supabase_user_id mapping column to users

Revision ID: 0018
Revises: 0017
Create Date: 2026-08-18
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("supabase_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_unique_constraint("uq_users_supabase_user_id", "users", ["supabase_user_id"])
    op.create_index("ix_users_supabase_user_id", "users", ["supabase_user_id"])


def downgrade() -> None:
    op.drop_index("ix_users_supabase_user_id", table_name="users")
    op.drop_constraint("uq_users_supabase_user_id", "users", type_="unique")
    op.drop_column("users", "supabase_user_id")
