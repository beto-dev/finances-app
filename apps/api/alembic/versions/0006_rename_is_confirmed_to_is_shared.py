"""Rename charges.is_confirmed to is_shared — personal charges no longer auto-shared

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-04

"""
from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("charges", "is_confirmed", new_column_name="is_shared")


def downgrade() -> None:
    op.alter_column("charges", "is_shared", new_column_name="is_confirmed")
