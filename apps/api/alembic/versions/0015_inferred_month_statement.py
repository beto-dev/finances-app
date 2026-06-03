"""Add inferred_month/inferred_year to statements; revert 0014 date shifts

Migration 0014 modified charge dates, which was the wrong approach. This
migration reverts those changes (best-effort) and introduces the correct fix:
store inferred_month and inferred_year on each statement, derived from the
majority of its charge dates. Charge filtering now uses statement month, not
individual charge dates, so a Dec-31 charge in a January cartola appears in
January's view.

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-03
"""
import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Revert 0014: charges that were moved to the 1st of a month by the
    #    previous migration are moved back to the last day of the prior month.
    #    We identify them as charges dated on the 1st, in statements that also
    #    have charges in the prior month (bleed situation).
    op.execute("""
        WITH bleed_statements AS (
            SELECT DISTINCT c1.statement_id
            FROM charges c1
            JOIN charges c2 ON c1.statement_id = c2.statement_id
            WHERE EXTRACT(day FROM c1.date) = 1
              AND DATE_TRUNC('month', c2.date) =
                  (DATE_TRUNC('month', c1.date) - INTERVAL '1 month')
              AND EXTRACT(day FROM c2.date) >= 25
        ),
        to_revert AS (
            SELECT c.id,
                   (DATE_TRUNC('month', c.date) - INTERVAL '1 day')::date AS prior_last_day
            FROM charges c
            JOIN bleed_statements bs ON c.statement_id = bs.statement_id
            WHERE EXTRACT(day FROM c.date) = 1
        )
        UPDATE charges
        SET date = to_revert.prior_last_day
        FROM to_revert
        WHERE charges.id = to_revert.id
    """)

    # 2. Add inferred_month and inferred_year columns to statements
    op.add_column("statements", sa.Column("inferred_month", sa.Integer(), nullable=True))
    op.add_column("statements", sa.Column("inferred_year", sa.Integer(), nullable=True))

    # 3. Backfill from existing charge data using majority month per statement
    op.execute("""
        WITH charge_months AS (
            SELECT
                statement_id,
                EXTRACT(year  FROM date)::int AS yr,
                EXTRACT(month FROM date)::int AS mo,
                COUNT(*) AS cnt
            FROM charges
            GROUP BY statement_id, yr, mo
        ),
        majority AS (
            SELECT DISTINCT ON (statement_id)
                statement_id, yr, mo
            FROM charge_months
            ORDER BY statement_id, cnt DESC
        )
        UPDATE statements s
        SET inferred_month = m.mo,
            inferred_year  = m.yr
        FROM majority m
        WHERE s.id = m.statement_id
    """)


def downgrade() -> None:
    op.drop_column("statements", "inferred_year")
    op.drop_column("statements", "inferred_month")
