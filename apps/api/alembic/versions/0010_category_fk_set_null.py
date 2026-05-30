"""charges.category_id FK: set null on category delete

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-29
"""
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the existing FK dynamically (name may vary by environment)
    op.execute("""
        DO $$
        DECLARE fk text;
        BEGIN
            SELECT conname INTO fk
            FROM pg_constraint
            WHERE conrelid = 'charges'::regclass
              AND contype = 'f'
              AND confrelid = 'categories'::regclass;
            IF fk IS NOT NULL THEN
                EXECUTE 'ALTER TABLE charges DROP CONSTRAINT ' || quote_ident(fk);
            END IF;
        END $$;
    """)
    op.create_foreign_key(
        "charges_category_id_fkey",
        "charges", "categories",
        ["category_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("charges_category_id_fkey", "charges", type_="foreignkey")
    op.create_foreign_key(
        "charges_category_id_fkey",
        "charges", "categories",
        ["category_id"], ["id"],
    )
