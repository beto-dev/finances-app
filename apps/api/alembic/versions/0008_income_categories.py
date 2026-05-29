"""Add income system categories

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-29
"""
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO categories (name, is_system, color) VALUES
        ('Remuneración', true, '#10b981'),
        ('Abono', true, '#06b6d4'),
        ('Transferencia recibida', true, '#84cc16'),
        ('Devolución / Reembolso', true, '#f59e0b')
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM categories
        WHERE name IN ('Remuneración', 'Abono', 'Transferencia recibida', 'Devolución / Reembolso')
        AND is_system = true
    """)
