from abc import ABC, abstractmethod
from uuid import UUID
from domain.entities.statement import Statement


class StatementRepository(ABC):
    @abstractmethod
    async def get_by_id(self, statement_id: UUID) -> Statement | None: ...

    @abstractmethod
    async def get_by_family(self, family_id: UUID, uploaded_by: UUID | None = None) -> list[Statement]: ...

    @abstractmethod
    async def create(self, family_id: UUID, uploaded_by: UUID, filename: str, statement_type: str, storage_path: str | None, bank_hint: str | None) -> Statement: ...

    @abstractmethod
    async def update_status(self, statement_id: UUID, status: str) -> Statement: ...

    @abstractmethod
    async def get_by_family_and_filename(self, family_id: UUID, filename: str, exclude_id: UUID) -> list[Statement]: ...
