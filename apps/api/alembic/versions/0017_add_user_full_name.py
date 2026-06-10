"""Add full_name to users

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-09
"""
import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("full_name", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "full_name")
