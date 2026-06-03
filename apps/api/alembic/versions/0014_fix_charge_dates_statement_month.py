"""Align end-of-prior-month charge dates to the statement's majority month

Some bank cartolas include charges from the last 1-3 days of the previous month
(e.g. Dec 31 in a January cartola). These were stored with their original date,
causing them to appear in the wrong month's view. This migration moves any
charge dated on day >= 28 of the month immediately before the statement's
majority month to the 1st of that majority month.

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-03
"""
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        WITH charge_months AS (
            SELECT
                statement_id,
                DATE_TRUNC('month', date)::date AS month_start,
                COUNT(*) AS cnt
            FROM charges
            GROUP BY statement_id, DATE_TRUNC('month', date)
        ),
        statement_majority AS (
            SELECT DISTINCT ON (statement_id)
                statement_id,
                month_start AS majority_month_start
            FROM charge_months
            ORDER BY statement_id, cnt DESC
        ),
        charges_to_fix AS (
            SELECT
                c.id,
                sm.majority_month_start
            FROM charges c
            JOIN statement_majority sm ON c.statement_id = sm.statement_id
            WHERE
                DATE_TRUNC('month', c.date)::date =
                    (sm.majority_month_start - INTERVAL '1 month')::date
                AND EXTRACT(day FROM c.date) >= 28
        )
        UPDATE charges
        SET date = charges_to_fix.majority_month_start
        FROM charges_to_fix
        WHERE charges.id = charges_to_fix.id
    """)


def downgrade() -> None:
    # Original dates are not stored — downgrade is a no-op
    pass
