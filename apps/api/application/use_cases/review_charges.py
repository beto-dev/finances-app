import re
from uuid import UUID

from domain.entities.charge import Charge
from domain.repositories.category_repository import CategoryRepository
from domain.repositories.charge_repository import ChargeRepository


def extract_pattern(description: str) -> str:
    """Strip trailing noise tokens (IDs, numbers, transaction codes) from a bank description."""
    tokens = description.strip().split()
    while len(tokens) > 1:
        last = tokens[-1]
        if re.match(r'^\d+$', last):
            tokens.pop()
        elif len(last) >= 4 and re.match(r'^[A-Z0-9\-\./]+$', last, re.IGNORECASE) and any(c.isdigit() for c in last):
            tokens.pop()
        else:
            break
    return ' '.join(tokens)


class ReviewChargesUseCase:
    def __init__(self, charge_repo: ChargeRepository, category_repo: CategoryRepository) -> None:
        self._charges = charge_repo
        self._categories = category_repo

    async def update_category(self, charge_id: UUID, category_id: UUID, family_id: UUID) -> Charge:
        category = await self._categories.get_by_id(category_id)
        if category is None:
            raise ValueError(f"Category {category_id} not found")
        charge = await self._charges.update_category(charge_id, category_id)
        pattern = extract_pattern(charge.description)
        await self._categories.upsert_rule(family_id, pattern, category_id)
        return charge

    async def count_similar(self, uploaded_by: UUID, description: str, exclude_id: UUID, exclude_category_id: UUID) -> tuple[int, str]:
        pattern = extract_pattern(description)
        count = await self._charges.count_similar(uploaded_by, pattern, exclude_id, exclude_category_id)
        return count, pattern

    async def apply_to_similar(self, uploaded_by: UUID, family_id: UUID, pattern: str, category_id: UUID, exclude_id: UUID) -> int:
        category = await self._categories.get_by_id(category_id)
        if category is None:
            raise ValueError(f"Category {category_id} not found")
        count = await self._charges.apply_category_by_pattern(uploaded_by, pattern, category_id, exclude_id)
        await self._categories.upsert_rule(family_id, pattern, category_id)
        return count

    async def bulk_confirm(self, charge_ids: list[UUID]) -> int:
        return await self._charges.bulk_confirm(charge_ids)

    async def count_similar_unshared(self, uploaded_by: UUID, description: str, exclude_id: UUID) -> tuple[int, str]:
        pattern = extract_pattern(description)
        count = await self._charges.count_similar_unshared(uploaded_by, pattern, exclude_id)
        return count, pattern

    async def share_similar(self, uploaded_by: UUID, pattern: str, exclude_id: UUID) -> int:
        return await self._charges.bulk_share_by_pattern(uploaded_by, pattern, exclude_id)

    async def learn_rule(self, family_id: UUID, description: str, category_id: UUID) -> None:
        await self._categories.create_rule(family_id, description, category_id)
