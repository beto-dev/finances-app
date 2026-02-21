"""Initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-02-18

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    op.create_table(
        "families",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "family_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="member"),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("family_id", "user_id", name="uq_family_member"),
    )

    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "category_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pattern", sa.String(255), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "statements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("storage_path", sa.String(500), nullable=True),
        sa.Column("bank_hint", sa.String(100), nullable=True),
        sa.Column("type", sa.String(50), nullable=False, server_default="checking"),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "charges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("statement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("statements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="CLP"),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("is_confirmed", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("ai_suggested", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "google_sheet_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("spreadsheet_id", sa.String(255), nullable=False),
        sa.Column("spreadsheet_url", sa.String(500), nullable=False),
        sa.Column("access_token", sa.Text, nullable=True),
        sa.Column("refresh_token", sa.Text, nullable=True),
        sa.Column("token_expiry", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Seed default system categories
    op.execute("""
        INSERT INTO categories (name, is_system, color) VALUES
        ('Alimentación', true, '#22c55e'),
        ('Transporte', true, '#3b82f6'),
        ('Suscripciones', true, '#8b5cf6'),
        ('Salud', true, '#ef4444'),
        ('Hogar', true, '#f97316'),
        ('Ocio', true, '#eab308'),
        ('Ropa', true, '#ec4899'),
        ('Educación', true, '#06b6d4'),
        ('Viajes', true, '#14b8a6'),
        ('Otros', true, '#6b7280')
    """)


def downgrade() -> None:
    op.drop_table("google_sheet_configs")
    op.drop_table("charges")
    op.drop_table("statements")
    op.drop_table("category_rules")
    op.drop_table("categories")
    op.drop_table("family_members")
    op.drop_table("families")
    op.drop_table("users")
