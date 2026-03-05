"""Shared fixtures for all test modules."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID

import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from domain.entities.category import Category
from domain.entities.charge import Charge
from domain.entities.user import User
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
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc).replace(year=2099),
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
        created_at=datetime.now(timezone.utc),
    )


def make_category(*, name: str = "Food", is_system: bool = True) -> Category:
    return Category(
        id=uuid.uuid4(),
        name=name,
        is_system=is_system,
        created_at=datetime.now(timezone.utc),
    )


def make_user(*, family_id: UUID | None = None) -> User:
    now = datetime.now(timezone.utc)
    return User(
        id=TEST_USER_ID,
        email="test@example.com",
        family_id=family_id,
        created_at=now,
        updated_at=now,
    )


# ── Mock repositories ──────────────────────────────────────────────────────────
class MockChargeRepo:
    def __init__(self, charges: list[Charge] | None = None) -> None:
        self.charges = charges or []
        self.confirmed: list[list[UUID]] = []
        self.unshared: list[list[UUID]] = []

    async def get_personal(self, user_id: UUID, month: int | None = None, year: int | None = None) -> list[Charge]:
        return self.charges

    async def get_by_family(self, family_id: UUID, month: int | None, year: int | None, uploaded_by_filter: UUID | None = None) -> list[Charge]:
        return []

    async def get_by_id(self, charge_id: UUID) -> Charge | None:
        return next((c for c in self.charges if c.id == charge_id), None)

    async def get_by_statement(self, statement_id: UUID) -> list[Charge]:
        return [c for c in self.charges if c.statement_id == statement_id]

    async def get_confirmed_by_family(self, family_id: UUID, month: int | None, year: int | None) -> list[Charge]:
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

    async def update_category(self, charge_id: UUID, category_id: UUID, is_shared: bool) -> Charge:
        charge = next(c for c in self.charges if c.id == charge_id)
        charge.category_id = category_id
        charge.is_shared = is_shared
        return charge

    async def bulk_create(self, statement_id: UUID, charges: Any) -> list[Charge]:
        return []

    async def bulk_update_categories(self, charges: list[Charge]) -> None:
        pass

    async def delete_by_statement(self, statement_id: UUID) -> int:
        return 0


class MockCategoryRepo:
    def __init__(self, categories: list[Category] | None = None) -> None:
        self.categories = categories or [make_category()]

    async def get_by_id(self, category_id: UUID) -> Category | None:
        return next((c for c in self.categories if c.id == category_id), None)

    async def get_all(self, family_id: UUID | None = None) -> list[Category]:
        return self.categories

    async def create_rule(self, family_id: UUID, description: str, category_id: UUID) -> None:
        pass


class MockUserRepo:
    def __init__(self, user: User | None = None) -> None:
        self._user = user or make_user()

    async def get_by_id(self, user_id: UUID) -> User | None:
        return self._user if user_id == self._user.id else None

    async def get_by_email(self, email: str) -> User | None:
        return self._user if email == self._user.email else None

    async def create(self, email: str, hashed_password: str | None, family_id: UUID | None) -> User:
        return self._user


# ── HTTP client fixture ────────────────────────────────────────────────────────
@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token()}"}


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
