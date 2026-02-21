from abc import ABC, abstractmethod
from uuid import UUID
from domain.entities.category import Category, CategoryRule


class CategoryRepository(ABC):
    @abstractmethod
    async def get_all(self, family_id: UUID | None) -> list[Category]: ...

    @abstractmethod
    async def get_by_id(self, category_id: UUID) -> Category | None: ...

    @abstractmethod
    async def create(self, name: str, family_id: UUID | None, color: str | None) -> Category: ...

    @abstractmethod
    async def get_rules(self, family_id: UUID) -> list[CategoryRule]: ...

    @abstractmethod
    async def create_rule(self, family_id: UUID, pattern: str, category_id: UUID) -> CategoryRule: ...

    @abstractmethod
    async def find_matching_rule(self, family_id: UUID, description: str) -> CategoryRule | None: ...
