"""Drop inferred_month and inferred_year from statements

Reverts the schema changes from migration 0015. The inferred_month approach
is being replaced by a simpler UI warning for out-of-month charges.

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-03
"""
import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("statements", "inferred_year")
    op.drop_column("statements", "inferred_month")


def downgrade() -> None:
    op.add_column("statements", sa.Column("inferred_month", sa.Integer(), nullable=True))
    op.add_column("statements", sa.Column("inferred_year", sa.Integer(), nullable=True))
