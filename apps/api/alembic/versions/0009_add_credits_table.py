"""Add credits table

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-29
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("bank", sa.String(100), nullable=True),
        sa.Column("cuota_monto", sa.Integer, nullable=False),
        sa.Column("cuota_numero", sa.Integer, nullable=False, server_default="1"),
        sa.Column("cuota_total", sa.Integer, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_credits_user_id", "credits", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_credits_user_id", table_name="credits")
    op.drop_table("credits")
