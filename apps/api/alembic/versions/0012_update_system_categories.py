"""Add Servicios básicos, Farmacia, Ahorro/Inversión; remove Devolución/Reembolso and Transferencia recibida

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-30
"""
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new system categories
    op.execute("""
        INSERT INTO categories (name, is_system, color) VALUES
        ('Servicios básicos', true, '#0284c7'),
        ('Farmacia', true, '#be185d'),
        ('Ahorro / Inversión', true, '#65a30d')
    """)

    # Remove charges FK before deleting (in case migration 0010 hasn't applied the SET NULL constraint)
    op.execute("""
        UPDATE charges SET category_id = NULL
        WHERE category_id IN (
            SELECT id FROM categories
            WHERE name IN ('Devolución / Reembolso', 'Transferencia recibida')
            AND is_system = true
        )
    """)

    # Delete the categories (cascade will clean up category_rules)
    op.execute("""
        DELETE FROM categories
        WHERE name IN ('Devolución / Reembolso', 'Transferencia recibida')
        AND is_system = true
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM categories
        WHERE name IN ('Servicios básicos', 'Farmacia', 'Ahorro / Inversión')
        AND is_system = true
    """)
    op.execute("""
        INSERT INTO categories (name, is_system, color) VALUES
        ('Transferencia recibida', true, '#6366f1'),
        ('Devolución / Reembolso', true, '#f59e0b')
    """)
