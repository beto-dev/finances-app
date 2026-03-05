"""Unit tests for ReviewChargesUseCase — fully mocked, no DB."""
from __future__ import annotations

import uuid

import pytest

from application.use_cases.review_charges import ReviewChargesUseCase
from tests.conftest import MockCategoryRepo, MockChargeRepo, make_category, make_charge


class TestUpdateCategory:
    async def test_sets_is_shared_true(self):
        charge = make_charge()
        cat = make_category()
        repo = MockChargeRepo([charge])
        cat_repo = MockCategoryRepo([cat])
        uc = ReviewChargesUseCase(repo, cat_repo)

        result = await uc.update_category(charge.id, cat.id, family_id=uuid.uuid4())

        assert result.category_id == cat.id
        assert result.is_shared is True

    async def test_raises_if_category_not_found(self):
        charge = make_charge()
        repo = MockChargeRepo([charge])
        cat_repo = MockCategoryRepo([])  # empty
        uc = ReviewChargesUseCase(repo, cat_repo)

        with pytest.raises(ValueError, match="not found"):
            await uc.update_category(charge.id, uuid.uuid4(), family_id=uuid.uuid4())


class TestBulkConfirm:
    async def test_returns_count(self):
        charges = [make_charge(), make_charge(), make_charge()]
        repo = MockChargeRepo(charges)
        uc = ReviewChargesUseCase(repo, MockCategoryRepo())

        ids = [c.id for c in charges]
        count = await uc.bulk_confirm(ids)

        assert count == 3

    async def test_marks_charges_shared(self):
        charges = [make_charge(is_shared=False), make_charge(is_shared=False)]
        repo = MockChargeRepo(charges)
        uc = ReviewChargesUseCase(repo, MockCategoryRepo())

        await uc.bulk_confirm([c.id for c in charges])

        assert all(c.is_shared for c in charges)

    async def test_empty_list_returns_zero(self):
        repo = MockChargeRepo([])
        uc = ReviewChargesUseCase(repo, MockCategoryRepo())

        count = await uc.bulk_confirm([])
        assert count == 0


class TestLearnRule:
    async def test_delegates_to_category_repo(self):
        cat = make_category()
        cat_repo = MockCategoryRepo([cat])
        called_with: list = []

        original = cat_repo.create_rule
        async def spy(family_id, description, category_id):  # type: ignore[override]
            called_with.append((family_id, description, category_id))
        cat_repo.create_rule = spy  # type: ignore[method-assign]

        uc = ReviewChargesUseCase(MockChargeRepo(), cat_repo)
        fam_id = uuid.uuid4()
        await uc.learn_rule(fam_id, "Netflix", cat.id)

        assert len(called_with) == 1
        assert called_with[0] == (fam_id, "Netflix", cat.id)
