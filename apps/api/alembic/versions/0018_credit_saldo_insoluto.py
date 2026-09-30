"""Add saldo_insoluto to credits

NOTE: this is a `main`-only hotfix migration, cherry-picked ahead of the
staging→main promotion. `staging` already has revisions 0018-0021 reserved
for its own pending work (RLS, Sheets removal, etc.) — when staging is
eventually promoted to main, ONE of the two competing "0018"s must be
renumbered to keep the chain linear, the same way the 0019 RLS/Sheets
collision was resolved. See project memory "coolify_migration_architecture".

Revision ID: 0018
Revises: 0017
Create Date: 2026-09-30
"""
import sqlalchemy as sa

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("credits", sa.Column("saldo_insoluto", sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("credits", "saldo_insoluto")
