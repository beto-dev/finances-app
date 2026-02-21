from abc import ABC, abstractmethod
from uuid import UUID
from domain.entities.user import User


class UserRepository(ABC):
    @abstractmethod
    async def get_by_id(self, user_id: UUID) -> User | None: ...

    @abstractmethod
    async def get_by_email(self, email: str) -> User | None: ...

    @abstractmethod
    async def create(self, email: str, hashed_password: str | None, family_id: UUID | None) -> User: ...

    @abstractmethod
    async def update_family(self, user_id: UUID, family_id: UUID) -> User: ...
