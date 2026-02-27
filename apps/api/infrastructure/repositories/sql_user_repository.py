from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.entities.user import User
from domain.repositories.user_repository import UserRepository
from infrastructure.database.models import UserModel


def _to_entity(m: UserModel) -> User:
    return User(
        id=m.id,
        email=m.email,
        family_id=m.family_id,
        created_at=m.created_at,
        updated_at=m.updated_at,
        hashed_password=m.hashed_password,
    )


class SQLUserRepository(UserRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, user_id: UUID) -> User | None:
        result = await self._session.execute(select(UserModel).where(UserModel.id == user_id))
        m = result.scalar_one_or_none()
        return _to_entity(m) if m else None

    async def get_by_email(self, email: str) -> User | None:
        result = await self._session.execute(select(UserModel).where(UserModel.email == email))
        m = result.scalar_one_or_none()
        return _to_entity(m) if m else None

    async def create(self, email: str, hashed_password: str | None, family_id: UUID | None) -> User:
        m = UserModel(email=email, hashed_password=hashed_password, family_id=family_id)
        self._session.add(m)
        await self._session.commit()
        await self._session.refresh(m)
        return _to_entity(m)

    async def update_family(self, user_id: UUID, family_id: UUID) -> User:
        result = await self._session.execute(select(UserModel).where(UserModel.id == user_id))
        m = result.scalar_one()
        m.family_id = family_id
        await self._session.commit()
        await self._session.refresh(m)
        return _to_entity(m)
