from collections import defaultdict
from decimal import Decimal
from typing import Any
from uuid import UUID

from domain.repositories.category_repository import CategoryRepository
from domain.repositories.charge_repository import ChargeRepository
from domain.repositories.user_repository import UserRepository


class FinancialSummaryService:
    def __init__(
        self,
        charge_repo: ChargeRepository,
        category_repo: CategoryRepository,
        user_repo: UserRepository,
    ) -> None:
        self._charges = charge_repo
        self._categories = category_repo
        self._users = user_repo

    async def monthly_summary(self, user_id: UUID, month: int, year: int) -> dict[str, Any]:
        user = await self._users.get_by_id(user_id)
        family_id = user.family_id if user else None
        categories = await self._categories.get_all(family_id)
        cat_by_id: dict[UUID, str] = {c.id: c.name for c in categories}

        charges = await self._charges.get_personal(user_id, month, year)

        expenses = sum((c.amount for c in charges if c.amount > 0), Decimal(0))
        income = sum((-c.amount for c in charges if c.amount < 0), Decimal(0))

        cat_totals: dict[str, Decimal] = defaultdict(Decimal)
        for c in charges:
            if c.amount > 0 and c.category_id:
                cat_totals[cat_by_id.get(c.category_id, "Sin categoría")] += c.amount

        top_cats = sorted(cat_totals.items(), key=lambda x: x[1], reverse=True)[:5]

        return {
            "month": month,
            "year": year,
            "total_expenses": float(expenses),
            "total_income": float(income),
            "balance": float(income - expenses),
            "charge_count": len(charges),
            "top_categories": [{"name": n, "amount": float(a)} for n, a in top_cats],
        }
