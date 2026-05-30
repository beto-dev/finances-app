"""Add indexes on frequently queried columns

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-29
"""
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_charges_statement_id", "charges", ["statement_id"])
    op.create_index("ix_charges_category_id", "charges", ["category_id"])
    op.create_index("ix_statements_family_id", "statements", ["family_id"])
    op.create_index("ix_statements_uploaded_by", "statements", ["uploaded_by"])
    op.create_index("ix_category_rules_family_id", "category_rules", ["family_id"])


def downgrade() -> None:
    op.drop_index("ix_charges_statement_id", "charges")
    op.drop_index("ix_charges_category_id", "charges")
    op.drop_index("ix_statements_family_id", "statements")
    op.drop_index("ix_statements_uploaded_by", "statements")
    op.drop_index("ix_category_rules_family_id", "category_rules")
