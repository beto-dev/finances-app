from typing import Protocol
from uuid import UUID

from domain.entities.category import Category
from domain.entities.charge import Charge
from domain.repositories.category_repository import CategoryRepository


class ChargeCategorizerProtocol(Protocol):
    async def categorize_batch(self, charges: list[Charge], categories: list[Category]) -> list[Charge]: ...


class CategorizationService:
    def __init__(self, category_repo: CategoryRepository, categorizer: ChargeCategorizerProtocol) -> None:
        self._categories = category_repo
        self._categorizer = categorizer

    async def categorize(
        self, charges: list[Charge], categories: list[Category], family_id: UUID
    ) -> list[Charge]:
        rule_matched: list[Charge] = []
        needs_ai: list[Charge] = []

        for charge in charges:
            rule = await self._categories.find_matching_rule(family_id, charge.description)
            if rule:
                charge.category_id = rule.category_id
                charge.ai_suggested = False
                rule_matched.append(charge)
            else:
                needs_ai.append(charge)

        if needs_ai:
            ai_results = await self._categorizer.categorize_batch(needs_ai, categories)
            rule_matched.extend(ai_results)

        return rule_matched
