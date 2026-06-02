"""Tests for count_similar() and apply_to_similar() — not covered in test_review_charges.py."""
from __future__ import annotations

import uuid

import pytest

from application.use_cases.review_charges import ReviewChargesUseCase
from tests.conftest import MockCategoryRepo, MockChargeRepo, make_category, make_charge


class MockChargeRepoWithCounts(MockChargeRepo):
    def __init__(
        self,
        charges: list | None = None,
        similar_count: int = 0,
        apply_count: int = 0,
    ) -> None:
        super().__init__(charges)
        self._similar_count = similar_count
        self._apply_count = apply_count
        self.count_calls: list[tuple] = []
        self.apply_calls: list[tuple] = []

    async def count_similar(
        self, uploaded_by: uuid.UUID, pattern: str, exclude_id: uuid.UUID, exclude_category_id: uuid.UUID
    ) -> int:
        self.count_calls.append((uploaded_by, pattern, exclude_id, exclude_category_id))
        return self._similar_count

    async def apply_category_by_pattern(
        self, uploaded_by: uuid.UUID, pattern: str, category_id: uuid.UUID, exclude_id: uuid.UUID
    ) -> int:
        self.apply_calls.append((uploaded_by, pattern, category_id, exclude_id))
        return self._apply_count


class TestCountSimilar:
    async def test_extracts_pattern_before_delegating(self) -> None:
        charge = make_charge(description="UBER TRIP A1B2C3")
        cat = make_category()
        repo = MockChargeRepoWithCounts([charge], similar_count=3)
        uc = ReviewChargesUseCase(repo, MockCategoryRepo([cat]))

        count, pattern = await uc.count_similar(uuid.uuid4(), "UBER TRIP A1B2C3", charge.id, cat.id)

        assert pattern == "UBER TRIP"
        assert count == 3
        assert repo.count_calls[0][1] == "UBER TRIP"

    async def test_returns_zero_when_no_matches(self) -> None:
        charge = make_charge(description="NETFLIX")
        cat = make_category()
        repo = MockChargeRepoWithCounts([charge], similar_count=0)
        uc = ReviewChargesUseCase(repo, MockCategoryRepo([cat]))

        count, pattern = await uc.count_similar(uuid.uuid4(), "NETFLIX", charge.id, cat.id)

        assert count == 0
        assert pattern == "NETFLIX"

    async def test_passes_exclude_id_to_repo(self) -> None:
        charge = make_charge(description="RAPPI 99999")
        cat = make_category()
        repo = MockChargeRepoWithCounts([charge])
        uc = ReviewChargesUseCase(repo, MockCategoryRepo([cat]))

        await uc.count_similar(uuid.uuid4(), "RAPPI 99999", charge.id, cat.id)

        assert repo.count_calls[0][2] == charge.id


class TestApplyToSimilar:
    async def test_returns_updated_count(self) -> None:
        cat = make_category()
        repo = MockChargeRepoWithCounts(apply_count=5)
        uc = ReviewChargesUseCase(repo, MockCategoryRepo([cat]))

        count = await uc.apply_to_similar(uuid.uuid4(), uuid.uuid4(), "UBER TRIP", cat.id, uuid.uuid4())

        assert count == 5

    async def test_persists_rule_after_apply(self) -> None:
        cat = make_category()
        cat_repo = MockCategoryRepo([cat])
        uc = ReviewChargesUseCase(MockChargeRepoWithCounts(apply_count=2), cat_repo)
        family_id = uuid.uuid4()

        await uc.apply_to_similar(uuid.uuid4(), family_id, "RAPPI", cat.id, uuid.uuid4())

        assert len(cat_repo.rule_calls) == 1
        fam, pattern, cat_id = cat_repo.rule_calls[0]
        assert fam == family_id
        assert pattern == "RAPPI"
        assert cat_id == cat.id

    async def test_raises_if_category_not_found(self) -> None:
        uc = ReviewChargesUseCase(MockChargeRepoWithCounts(), MockCategoryRepo([]))

        with pytest.raises(ValueError, match="not found"):
            await uc.apply_to_similar(uuid.uuid4(), uuid.uuid4(), "UBER", uuid.uuid4(), uuid.uuid4())

    async def test_zero_matches_still_saves_rule(self) -> None:
        cat = make_category()
        cat_repo = MockCategoryRepo([cat])
        uc = ReviewChargesUseCase(MockChargeRepoWithCounts(apply_count=0), cat_repo)

        count = await uc.apply_to_similar(uuid.uuid4(), uuid.uuid4(), "UNIQUESHOP", cat.id, uuid.uuid4())

        assert count == 0
        assert len(cat_repo.rule_calls) == 1
