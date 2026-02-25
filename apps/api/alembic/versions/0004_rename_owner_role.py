"""Rename owner role to admin in family_members

Revision ID: 0004
Revises: 0003
Create Date: 2026-02-24

"""
from typing import Sequence, Union
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE family_members SET role = 'admin' WHERE role = 'owner'")


def downgrade() -> None:
    op.execute("UPDATE family_members SET role = 'owner' WHERE role = 'admin'")
