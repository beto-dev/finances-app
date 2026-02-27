from uuid import UUID

from domain.entities.charge import Charge
from domain.repositories.category_repository import CategoryRepository
from domain.repositories.charge_repository import ChargeRepository


class ReviewChargesUseCase:
    def __init__(self, charge_repo: ChargeRepository, category_repo: CategoryRepository) -> None:
        self._charges = charge_repo
        self._categories = category_repo

    async def update_category(self, charge_id: UUID, category_id: UUID, family_id: UUID) -> Charge:
        category = await self._categories.get_by_id(category_id)
        if category is None:
            raise ValueError(f"Category {category_id} not found")
        return await self._charges.update_category(charge_id, category_id, is_confirmed=True)

    async def bulk_confirm(self, charge_ids: list[UUID]) -> int:
        return await self._charges.bulk_confirm(charge_ids)

    async def learn_rule(self, family_id: UUID, description: str, category_id: UUID) -> None:
        await self._categories.create_rule(family_id, description, category_id)
