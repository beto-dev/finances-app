from uuid import UUID
from domain.entities.charge import Charge
from domain.repositories.charge_repository import ChargeRepository
from domain.repositories.category_repository import CategoryRepository
from application.services.categorization_service import CategorizationService


class CategorizeChargesUseCase:
    def __init__(
        self,
        charge_repo: ChargeRepository,
        category_repo: CategoryRepository,
        categorization_service: CategorizationService,
    ) -> None:
        self._charges = charge_repo
        self._categories = category_repo
        self._categorization = categorization_service

    async def execute(self, statement_id: UUID, family_id: UUID) -> list[Charge]:
        charges = await self._charges.get_by_statement(statement_id)
        uncategorized = [c for c in charges if c.category_id is None]
        if not uncategorized:
            return charges

        categories = await self._categories.get_all(family_id)
        results = await self._categorization.categorize(uncategorized, categories, family_id)
        await self._charges.bulk_update_categories(results)
        return results
