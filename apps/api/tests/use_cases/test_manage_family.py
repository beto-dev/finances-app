"""Tests for ManageFamilyUseCase."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from application.use_cases.manage_family import ManageFamilyUseCase
from domain.entities.family import Family, FamilyMember
from domain.entities.user import User
from domain.repositories.family_repository import FamilyRepository
from domain.repositories.user_repository import UserRepository
from tests.conftest import TEST_USER_ID, make_user


def _make_family(*, owner_id: uuid.UUID | None = None) -> Family:
    now = datetime.now(UTC)
    return Family(id=uuid.uuid4(), name="Los Tejos", owner_id=owner_id or TEST_USER_ID, created_at=now, updated_at=now)


def _make_member(*, family_id: uuid.UUID, user_id: uuid.UUID, role: str = "member") -> FamilyMember:
    return FamilyMember(
        id=uuid.uuid4(),
        family_id=family_id,
        user_id=user_id,
        role=role,
        is_active=True,
        joined_at=datetime.now(UTC),
    )


class MockFamilyRepo(FamilyRepository):
    def __init__(self, family: Family | None = None, members: list[FamilyMember] | None = None) -> None:
        self._family = family
        self._members: list[FamilyMember] = members or []
        self.add_member_calls: list[tuple] = []

    async def get_by_id(self, family_id: uuid.UUID) -> Family | None:
        return self._family

    async def create(self, name: str, owner_id: uuid.UUID) -> Family:
        fam = _make_family(owner_id=owner_id)
        self._family = fam
        return fam

    async def get_members(self, family_id: uuid.UUID) -> list[FamilyMember]:
        return self._members

    async def add_member(self, family_id: uuid.UUID, user_id: uuid.UUID, role: str = "member") -> FamilyMember:
        self.add_member_calls.append((family_id, user_id, role))
        m = _make_member(family_id=family_id, user_id=user_id, role=role)
        self._members.append(m)
        return m

    async def remove_member(self, family_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self._members = [m for m in self._members if m.user_id != user_id]


class MockUserRepo(UserRepository):
    def __init__(self, users: list[User] | None = None) -> None:
        self._users: list[User] = users or [make_user()]
        self.update_family_calls: list[tuple] = []

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return next((u for u in self._users if u.id == user_id), None)

    async def get_by_email(self, email: str) -> User | None:
        return next((u for u in self._users if u.email == email), None)

    async def create(self, email: str, hashed_password: str | None, family_id: uuid.UUID | None) -> User:
        return self._users[0]

    async def update_family(self, user_id: uuid.UUID, family_id: uuid.UUID) -> User:
        self.update_family_calls.append((user_id, family_id))
        return next(u for u in self._users if u.id == user_id)


# ── create_family ─────────────────────────────────────────────────────────────

class TestCreateFamily:
    async def test_adds_owner_as_admin_member(self) -> None:
        family_repo = MockFamilyRepo()
        user_repo = MockUserRepo()
        uc = ManageFamilyUseCase(family_repo, user_repo)

        await uc.create_family("Los Tejos", TEST_USER_ID)

        assert any(call[1] == TEST_USER_ID and call[2] == "admin" for call in family_repo.add_member_calls)

    async def test_links_family_to_owner_user(self) -> None:
        family_repo = MockFamilyRepo()
        user_repo = MockUserRepo()
        uc = ManageFamilyUseCase(family_repo, user_repo)

        family = await uc.create_family("Los Tejos", TEST_USER_ID)

        assert any(call[0] == TEST_USER_ID and call[1] == family.id for call in user_repo.update_family_calls)

    async def test_returns_created_family(self) -> None:
        uc = ManageFamilyUseCase(MockFamilyRepo(), MockUserRepo())
        family = await uc.create_family("Los Tejos", TEST_USER_ID)
        assert family is not None
        assert family.owner_id == TEST_USER_ID


# ── invite_member ─────────────────────────────────────────────────────────────

class TestInviteMember:
    async def test_raises_if_user_email_not_found(self) -> None:
        uc = ManageFamilyUseCase(MockFamilyRepo(), MockUserRepo(users=[]))

        with pytest.raises(ValueError, match="No user found"):
            await uc.invite_member(uuid.uuid4(), "nobody@example.com")

    async def test_adds_new_member_to_family(self) -> None:
        family = _make_family()
        invitee = make_user()
        invitee.email = "invitee@example.com"
        family_repo = MockFamilyRepo(family=family, members=[])
        user_repo = MockUserRepo(users=[invitee])
        uc = ManageFamilyUseCase(family_repo, user_repo)

        member = await uc.invite_member(family.id, "invitee@example.com")

        assert member.user_id == invitee.id
        assert len(family_repo.add_member_calls) == 1

    async def test_sets_family_on_invited_user(self) -> None:
        family = _make_family()
        invitee = make_user()
        invitee.email = "invitee@example.com"
        family_repo = MockFamilyRepo(family=family)
        user_repo = MockUserRepo(users=[invitee])
        uc = ManageFamilyUseCase(family_repo, user_repo)

        await uc.invite_member(family.id, "invitee@example.com")

        assert any(call[0] == invitee.id for call in user_repo.update_family_calls)

    async def test_existing_member_returns_without_duplicate(self) -> None:
        family = _make_family()
        invitee = make_user()
        invitee.email = "invitee@example.com"
        existing = _make_member(family_id=family.id, user_id=invitee.id)
        family_repo = MockFamilyRepo(family=family, members=[existing])
        user_repo = MockUserRepo(users=[invitee])
        uc = ManageFamilyUseCase(family_repo, user_repo)

        member = await uc.invite_member(family.id, "invitee@example.com")

        assert member.user_id == invitee.id
        assert len(family_repo.add_member_calls) == 0


# ── get_members ───────────────────────────────────────────────────────────────

class TestGetMembers:
    async def test_returns_all_members(self) -> None:
        family = _make_family()
        m1 = _make_member(family_id=family.id, user_id=uuid.uuid4())
        m2 = _make_member(family_id=family.id, user_id=uuid.uuid4())
        uc = ManageFamilyUseCase(MockFamilyRepo(family=family, members=[m1, m2]), MockUserRepo())

        members = await uc.get_members(family.id)

        assert len(members) == 2

    async def test_returns_empty_for_family_with_no_members(self) -> None:
        uc = ManageFamilyUseCase(MockFamilyRepo(members=[]), MockUserRepo())
        members = await uc.get_members(uuid.uuid4())
        assert members == []
