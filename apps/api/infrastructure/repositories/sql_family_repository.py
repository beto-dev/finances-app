from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from domain.entities.family import Family, FamilyMember
from domain.repositories.family_repository import FamilyRepository
from infrastructure.database.models import FamilyModel, FamilyMemberModel


def _to_family(m: FamilyModel) -> Family:
    return Family(id=m.id, name=m.name, owner_id=m.owner_id, created_at=m.created_at, updated_at=m.updated_at)


def _to_member(m: FamilyMemberModel) -> FamilyMember:
    return FamilyMember(id=m.id, family_id=m.family_id, user_id=m.user_id, role=m.role, is_active=m.is_active, joined_at=m.joined_at)


class SQLFamilyRepository(FamilyRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, family_id: UUID) -> Family | None:
        result = await self._session.execute(select(FamilyModel).where(FamilyModel.id == family_id))
        m = result.scalar_one_or_none()
        return _to_family(m) if m else None

    async def create(self, name: str, owner_id: UUID) -> Family:
        m = FamilyModel(name=name, owner_id=owner_id)
        self._session.add(m)
        await self._session.commit()
        await self._session.refresh(m)
        return _to_family(m)

    async def get_members(self, family_id: UUID) -> list[FamilyMember]:
        result = await self._session.execute(
            select(FamilyMemberModel).where(FamilyMemberModel.family_id == family_id)
        )
        return [_to_member(m) for m in result.scalars().all()]

    async def add_member(self, family_id: UUID, user_id: UUID, role: str = "member") -> FamilyMember:
        m = FamilyMemberModel(family_id=family_id, user_id=user_id, role=role)
        self._session.add(m)
        await self._session.commit()
        await self._session.refresh(m)
        return _to_member(m)

    async def get_member(self, family_id: UUID, user_id: UUID) -> FamilyMember | None:
        result = await self._session.execute(
            select(FamilyMemberModel).where(
                FamilyMemberModel.family_id == family_id,
                FamilyMemberModel.user_id == user_id,
            )
        )
        m = result.scalar_one_or_none()
        return _to_member(m) if m else None

    async def set_member_role(self, family_id: UUID, user_id: UUID, role: str) -> FamilyMember | None:
        result = await self._session.execute(
            select(FamilyMemberModel).where(
                FamilyMemberModel.family_id == family_id,
                FamilyMemberModel.user_id == user_id,
            )
        )
        m = result.scalar_one_or_none()
        if not m:
            return None
        m.role = role
        await self._session.commit()
        await self._session.refresh(m)
        return _to_member(m)

    async def set_member_active(self, family_id: UUID, user_id: UUID, is_active: bool) -> FamilyMember | None:
        result = await self._session.execute(
            select(FamilyMemberModel).where(
                FamilyMemberModel.family_id == family_id,
                FamilyMemberModel.user_id == user_id,
            )
        )
        m = result.scalar_one_or_none()
        if not m:
            return None
        m.is_active = is_active
        await self._session.commit()
        await self._session.refresh(m)
        return _to_member(m)

    async def remove_member(self, family_id: UUID, user_id: UUID) -> None:
        result = await self._session.execute(
            select(FamilyMemberModel).where(
                FamilyMemberModel.family_id == family_id,
                FamilyMemberModel.user_id == user_id,
            )
        )
        m = result.scalar_one_or_none()
        if m:
            await self._session.delete(m)
            await self._session.commit()
