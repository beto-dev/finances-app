"""Make statements.family_id nullable for personal charges

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-04

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("statements", "family_id", existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    # Set any NULL family_ids to a placeholder before making NOT NULL again
    op.execute("DELETE FROM statements WHERE family_id IS NULL")
    op.alter_column("statements", "family_id", existing_type=sa.UUID(), nullable=False)
