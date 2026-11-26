"""Tests for FinancialSummaryService.monthly_summary."""
from __future__ import annotations

import uuid
from decimal import Decimal
from uuid import UUID

import pytest

from application.services.financial_summary_service import FinancialSummaryService
from domain.entities.charge import Charge
from domain.repositories.charge_repository import ChargeRepository
from tests.conftest import (
    TEST_FAMILY_ID,
    TEST_USER_ID,
    MockCategoryRepo,
    MockUserRepo,
    make_category,
    make_charge,
    make_user,
)


class _SplitChargeRepo(ChargeRepository):
    """Returns different charges for get_personal vs get_by_family, so tests can
    tell whether monthly_summary is combining both (real families are always
    family-scoped, so get_personal alone returns nothing for them)."""

    def __init__(self, personal: list[Charge], family: list[Charge]) -> None:
        self._personal = personal
        self._family = family

    async def get_personal(self, user_id: UUID, month: int | None = None, year: int | None = None) -> list[Charge]:
        return self._personal

    async def get_by_family(
        self, family_id: UUID, month: int | None, year: int | None, uploaded_by_filter: UUID | None = None
    ) -> list[Charge]:
        return self._family

    async def get_by_id(self, charge_id: UUID) -> Charge | None:
        raise NotImplementedError

    async def get_by_statement(self, statement_id: UUID) -> list[Charge]:
        raise NotImplementedError

    async def get_confirmed_by_family(self, family_id: UUID, month: int | None, year: int | None) -> list[Charge]:
        raise NotImplementedError

    async def bulk_create(self, statement_id, charges):
        raise NotImplementedError

    async def update_category(self, charge_id, category_id):
        raise NotImplementedError

    async def update_cuota_numero(self, charge_id, cuota_numero):
        raise NotImplementedError

    async def bulk_confirm(self, charge_ids):
        raise NotImplementedError

    async def bulk_unshare(self, charge_ids):
        raise NotImplementedError

    async def bulk_update_categories(self, charges):
        raise NotImplementedError

    async def delete_by_statement(self, statement_id):
        raise NotImplementedError

    async def delete(self, charge_id):
        raise NotImplementedError

    async def count_similar(self, uploaded_by, pattern, exclude_id, exclude_category_id):
        raise NotImplementedError

    async def apply_category_by_pattern(self, uploaded_by, pattern, category_id, exclude_id):
        raise NotImplementedError

    async def count_similar_unshared(self, uploaded_by, pattern, exclude_id):
        raise NotImplementedError

    async def bulk_share_by_pattern(self, uploaded_by, pattern, exclude_id):
        raise NotImplementedError


@pytest.mark.asyncio
async def test_monthly_summary_includes_family_scoped_charges():
    """A real family member's statements all have family_id set (get_personal alone
    always returns []) — the summary must still count them via get_by_family."""
    category = make_category()
    family_charge = make_charge(amount=Decimal("15000"), category_id=category.id)
    repo = _SplitChargeRepo(personal=[], family=[family_charge])
    service = FinancialSummaryService(
        charge_repo=repo,
        category_repo=MockCategoryRepo([category]),
        user_repo=MockUserRepo(make_user(family_id=TEST_FAMILY_ID)),
    )

    result = await service.monthly_summary(TEST_USER_ID, month=3, year=2026)

    assert result["total_expenses"] == 15000.0
    assert result["charge_count"] == 1
    assert result["top_categories"] == [{"name": category.name, "amount": 15000.0}]


@pytest.mark.asyncio
async def test_monthly_summary_sums_personal_and_family_charges():
    category = make_category()
    personal_charge = make_charge(id=uuid.uuid4(), amount=Decimal("1000"), category_id=category.id)
    family_charge = make_charge(id=uuid.uuid4(), amount=Decimal("2000"), category_id=category.id)
    repo = _SplitChargeRepo(personal=[personal_charge], family=[family_charge])
    service = FinancialSummaryService(
        charge_repo=repo,
        category_repo=MockCategoryRepo([category]),
        user_repo=MockUserRepo(make_user(family_id=TEST_FAMILY_ID)),
    )

    result = await service.monthly_summary(TEST_USER_ID, month=3, year=2026)

    assert result["total_expenses"] == 3000.0
    assert result["charge_count"] == 2


@pytest.mark.asyncio
async def test_monthly_summary_skips_family_lookup_without_a_family():
    """A user with no family_id has nothing to combine get_personal with."""
    category = make_category()
    personal_charge = make_charge(amount=Decimal("500"), category_id=category.id)
    repo = _SplitChargeRepo(personal=[personal_charge], family=[make_charge(amount=Decimal("99999"))])
    service = FinancialSummaryService(
        charge_repo=repo,
        category_repo=MockCategoryRepo([category]),
        user_repo=MockUserRepo(make_user(family_id=None)),
    )

    result = await service.monthly_summary(TEST_USER_ID, month=3, year=2026)

    assert result["total_expenses"] == 500.0
    assert result["charge_count"] == 1
