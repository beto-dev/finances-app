"""Add saldo_insoluto to credits

Revision ID: 0021
Revises: 0020
Create Date: 2026-09-30
"""
import sqlalchemy as sa

from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("credits", sa.Column("saldo_insoluto", sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("credits", "saldo_insoluto")
