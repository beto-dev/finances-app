"""add cuota fields to charges

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("charges", sa.Column("cuota_numero", sa.Integer(), nullable=True))
    op.add_column("charges", sa.Column("cuota_total", sa.Integer(), nullable=True))
    op.add_column("charges", sa.Column("cuota_monto", sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("charges", "cuota_monto")
    op.drop_column("charges", "cuota_total")
    op.drop_column("charges", "cuota_numero")
