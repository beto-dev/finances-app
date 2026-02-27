from uuid import UUID

from domain.entities.family import Family, FamilyMember
from domain.repositories.family_repository import FamilyRepository
from domain.repositories.user_repository import UserRepository


class ManageFamilyUseCase:
    def __init__(self, family_repo: FamilyRepository, user_repo: UserRepository) -> None:
        self._families = family_repo
        self._users = user_repo

    async def create_family(self, name: str, owner_id: UUID) -> Family:
        family = await self._families.create(name, owner_id)
        await self._families.add_member(family.id, owner_id, "admin")
        await self._users.update_family(owner_id, family.id)
        return family

    async def invite_member(self, family_id: UUID, email: str) -> FamilyMember:
        user = await self._users.get_by_email(email)
        if user is None:
            raise ValueError(f"No user found with email: {email}")
        members = await self._families.get_members(family_id)
        existing = next((m for m in members if m.user_id == user.id), None)
        if existing:
            await self._users.update_family(user.id, family_id)
            return existing
        member = await self._families.add_member(family_id, user.id)
        await self._users.update_family(user.id, family_id)
        return member

    async def get_members(self, family_id: UUID) -> list[FamilyMember]:
        return await self._families.get_members(family_id)
