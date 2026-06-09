from abc import ABC, abstractmethod
from uuid import UUID

from domain.entities.charge import Charge, ParsedCharge


class ChargeRepository(ABC):
    @abstractmethod
    async def get_by_id(self, charge_id: UUID) -> Charge | None: ...

    @abstractmethod
    async def get_by_statement(self, statement_id: UUID) -> list[Charge]: ...

    @abstractmethod
    async def get_by_family(self, family_id: UUID, month: int | None, year: int | None) -> list[Charge]: ...

    @abstractmethod
    async def get_personal(self, user_id: UUID, month: int | None, year: int | None) -> list[Charge]: ...

    @abstractmethod
    async def bulk_create(self, statement_id: UUID, charges: list[ParsedCharge]) -> list[Charge]: ...

    @abstractmethod
    async def update_category(self, charge_id: UUID, category_id: UUID) -> Charge: ...

    @abstractmethod
    async def bulk_confirm(self, charge_ids: list[UUID]) -> int: ...

    @abstractmethod
    async def bulk_unshare(self, charge_ids: list[UUID]) -> int: ...

    @abstractmethod
    async def bulk_update_categories(self, charges: list[Charge]) -> None: ...

    @abstractmethod
    async def delete_by_statement(self, statement_id: UUID) -> int: ...

    @abstractmethod
    async def delete(self, charge_id: UUID) -> None: ...

    @abstractmethod
    async def get_confirmed_by_family(self, family_id: UUID, month: int | None, year: int | None) -> list[Charge]: ...

    @abstractmethod
    async def count_similar(self, uploaded_by: UUID, pattern: str, exclude_id: UUID, exclude_category_id: UUID) -> int: ...

    @abstractmethod
    async def apply_category_by_pattern(self, uploaded_by: UUID, pattern: str, category_id: UUID, exclude_id: UUID) -> int: ...

    @abstractmethod
    async def count_similar_unshared(self, uploaded_by: UUID, pattern: str, exclude_id: UUID) -> int: ...

    @abstractmethod
    async def bulk_share_by_pattern(self, uploaded_by: UUID, pattern: str, exclude_id: UUID) -> int: ...
