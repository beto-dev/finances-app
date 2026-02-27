from abc import ABC, abstractmethod
from uuid import UUID

from domain.entities.family import Family, FamilyMember


class FamilyRepository(ABC):
    @abstractmethod
    async def get_by_id(self, family_id: UUID) -> Family | None: ...

    @abstractmethod
    async def create(self, name: str, owner_id: UUID) -> Family: ...

    @abstractmethod
    async def get_members(self, family_id: UUID) -> list[FamilyMember]: ...

    @abstractmethod
    async def add_member(self, family_id: UUID, user_id: UUID, role: str = "member") -> FamilyMember: ...

    @abstractmethod
    async def remove_member(self, family_id: UUID, user_id: UUID) -> None: ...
