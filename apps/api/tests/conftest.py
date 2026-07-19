"""Shared fixtures for all test modules."""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from domain.entities.category import Category, CategoryRule
from domain.entities.charge import Charge, ParsedCharge
from domain.entities.user import User
from domain.repositories.category_repository import CategoryRepository
from domain.repositories.charge_repository import ChargeRepository
from domain.repositories.user_repository import UserRepository
from presentation.main import app

# ── Constants ──────────────────────────────────────────────────────────────────
TEST_USER_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
TEST_FAMILY_ID = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
JWT_SECRET = "change-this-secret"
JWT_ALGORITHM = "HS256"


# ── Helpers ────────────────────────────────────────────────────────────────────
def make_token(user_id: UUID = TEST_USER_ID) -> str:
    payload = {
        "sub": str(user_id),
        "iat": datetime.now(UTC),
        "exp": datetime.now(UTC).replace(year=2099),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def make_charge(
    *,
    id: UUID | None = None,
    statement_id: UUID | None = None,
    description: str = "Test charge",
    amount: Decimal = Decimal("1000"),
    is_shared: bool = False,
    ai_suggested: bool = False,
    category_id: UUID | None = None,
    charge_date: date | None = None,
) -> Charge:
    return Charge(
        id=id or uuid.uuid4(),
        statement_id=statement_id or uuid.uuid4(),
        date=charge_date or date(2026, 3, 1),
        description=description,
        amount=amount,
        currency="CLP",
        is_shared=is_shared,
        ai_suggested=ai_suggested,
        category_id=category_id,
        created_at=datetime.now(UTC),
    )


def make_category(*, name: str = "Food", is_system: bool = True) -> Category:
    return Category(
        id=uuid.uuid4(),
        name=name,
        is_system=is_system,
        created_at=datetime.now(UTC),
    )


def make_user(*, family_id: UUID | None = None) -> User:
    now = datetime.now(UTC)
    return User(
        id=TEST_USER_ID,
        email="test@example.com",
        family_id=family_id,
        created_at=now,
        updated_at=now,
    )


# ── Mock repositories ──────────────────────────────────────────────────────────
class MockChargeRepo(ChargeRepository):
    def __init__(self, charges: list[Charge] | None = None) -> None:
        self.charges = charges or []
        self.confirmed: list[list[UUID]] = []
        self.unshared: list[list[UUID]] = []

    async def get_personal(
        self, user_id: UUID, month: int | None = None, year: int | None = None
    ) -> list[Charge]:
        return self.charges

    async def get_by_family(
        self,
        family_id: UUID,
        month: int | None,
        year: int | None,
        uploaded_by_filter: UUID | None = None,
    ) -> list[Charge]:
        return []

    async def get_by_id(self, charge_id: UUID) -> Charge | None:
        return next((c for c in self.charges if c.id == charge_id), None)

    async def get_by_statement(self, statement_id: UUID) -> list[Charge]:
        return [c for c in self.charges if c.statement_id == statement_id]

    async def get_confirmed_by_family(
        self, family_id: UUID, month: int | None, year: int | None
    ) -> list[Charge]:
        return [c for c in self.charges if c.is_shared]

    async def bulk_confirm(self, charge_ids: list[UUID]) -> int:
        self.confirmed.append(charge_ids)
        for c in self.charges:
            if c.id in charge_ids:
                c.is_shared = True
        return len(charge_ids)

    async def bulk_unshare(self, charge_ids: list[UUID]) -> int:
        self.unshared.append(charge_ids)
        for c in self.charges:
            if c.id in charge_ids:
                c.is_shared = False
        return len(charge_ids)

    async def update_category(self, charge_id: UUID, category_id: UUID) -> Charge:
        charge = next(c for c in self.charges if c.id == charge_id)
        charge.category_id = category_id
        return charge

    async def bulk_create(self, statement_id: UUID, charges: list[ParsedCharge]) -> list[Charge]:
        return []

    async def bulk_update_categories(self, charges: list[Charge]) -> None:
        pass

    async def delete_by_statement(self, statement_id: UUID) -> int:
        return 0

    async def delete(self, charge_id: UUID) -> None:
        pass

    async def count_similar(self, uploaded_by: UUID, pattern: str, exclude_id: UUID, exclude_category_id: UUID) -> int:
        return 0

    async def update_cuota_numero(self, charge_id: UUID, cuota_numero: int) -> Charge:
        charge = next(c for c in self.charges if c.id == charge_id)
        return charge

    async def apply_category_by_pattern(
        self, uploaded_by: UUID, pattern: str, category_id: UUID, exclude_id: UUID
    ) -> int:
        return 0

    async def count_similar_unshared(self, uploaded_by: UUID, pattern: str, exclude_id: UUID) -> int:
        return 0

    async def bulk_share_by_pattern(self, uploaded_by: UUID, pattern: str, exclude_id: UUID) -> int:
        return 0


class MockCategoryRepo(CategoryRepository):
    def __init__(self, categories: list[Category] | None = None) -> None:
        self.categories = categories or [make_category()]
        self.rule_calls: list[tuple[Any, ...]] = []

    async def get_by_id(self, category_id: UUID) -> Category | None:
        return next((c for c in self.categories if c.id == category_id), None)

    async def get_all(self, family_id: UUID | None = None) -> list[Category]:
        return self.categories

    async def create(self, name: str, family_id: UUID | None, color: str | None) -> Category:
        cat = Category(
            id=uuid.uuid4(),
            name=name,
            is_system=False,
            created_at=datetime.now(UTC),
            family_id=family_id,
            color=color,
        )
        self.categories.append(cat)
        return cat

    async def get_rules(self, family_id: UUID) -> list[CategoryRule]:
        return []

    async def find_matching_rule(self, family_id: UUID, description: str) -> CategoryRule | None:
        return None

    async def create_rule(self, family_id: UUID, pattern: str, category_id: UUID) -> CategoryRule:
        self.rule_calls.append((family_id, pattern, category_id))
        return CategoryRule(
            id=uuid.uuid4(),
            family_id=family_id,
            pattern=pattern,
            category_id=category_id,
            created_at=datetime.now(UTC),
        )

    async def upsert_rule(self, family_id: UUID, pattern: str, category_id: UUID) -> CategoryRule:
        self.rule_calls.append((family_id, pattern, category_id))
        return CategoryRule(
            id=uuid.uuid4(),
            family_id=family_id,
            pattern=pattern,
            category_id=category_id,
            created_at=datetime.now(UTC),
        )

    async def update(self, category_id: UUID, name: str, color: str | None) -> Category:
        cat = next(c for c in self.categories if c.id == category_id)
        cat.name = name
        cat.color = color
        return cat

    async def delete(self, category_id: UUID) -> None:
        self.categories = [c for c in self.categories if c.id != category_id]


class MockUserRepo(UserRepository):
    def __init__(self, user: User | None = None) -> None:
        self._user = user or make_user()

    async def get_by_id(self, user_id: UUID) -> User | None:
        return self._user if user_id == self._user.id else None

    async def get_by_email(self, email: str) -> User | None:
        return self._user if email == self._user.email else None

    async def create(self, email: str, hashed_password: str | None, family_id: UUID | None) -> User:
        return self._user

    async def update_family(self, user_id: UUID, family_id: UUID) -> User:
        self._user.family_id = family_id
        return self._user

    async def update_name(self, user_id: UUID, full_name: str | None) -> User:
        return self._user


# ── HTTP client fixture ────────────────────────────────────────────────────────
@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token()}"}


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
