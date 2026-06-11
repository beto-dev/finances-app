"""Tests for CategorizeChargesUseCase and CategorizationService."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from application.services.categorization_service import CategorizationService
from application.use_cases.categorize_charges import CategorizeChargesUseCase
from domain.entities.category import Category, CategoryRule
from tests.conftest import MockCategoryRepo, MockChargeRepo, make_category, make_charge


class _AlwaysFirstCategoryCategorizer:
    async def categorize_batch(self, charges: list, categories: list) -> list:
        cat = categories[0] if categories else None
        for c in charges:
            if cat:
                c.category_id = cat.id
                c.ai_suggested = True
        return charges


class _NullCategorizer:
    async def categorize_batch(self, charges: list, categories: list) -> list:
        return charges


# ── CategorizeChargesUseCase ──────────────────────────────────────────────────

class TestCategorizeChargesUseCase:
    async def test_skips_update_when_all_already_categorized(self) -> None:
        cat = make_category()
        charge = make_charge(category_id=cat.id)
        call_log: list[str] = []

        class TrackingRepo(MockChargeRepo):
            async def bulk_update_categories(self, charges: list) -> None:
                call_log.append("called")

        service = CategorizationService(MockCategoryRepo([cat]), _AlwaysFirstCategoryCategorizer())
        uc = CategorizeChargesUseCase(TrackingRepo([charge]), MockCategoryRepo([cat]), service)
        await uc.execute(charge.statement_id, uuid.uuid4())

        assert call_log == []

    async def test_categorizes_uncategorized_charges(self) -> None:
        cat = make_category()
        charge = make_charge(category_id=None)
        service = CategorizationService(MockCategoryRepo([cat]), _AlwaysFirstCategoryCategorizer())
        uc = CategorizeChargesUseCase(MockChargeRepo([charge]), MockCategoryRepo([cat]), service)

        results = await uc.execute(charge.statement_id, uuid.uuid4())

        assert any(c.category_id == cat.id for c in results)

    async def test_returns_empty_when_no_charges_on_statement(self) -> None:
        service = CategorizationService(MockCategoryRepo(), _NullCategorizer())
        uc = CategorizeChargesUseCase(MockChargeRepo([]), MockCategoryRepo(), service)

        results = await uc.execute(uuid.uuid4(), uuid.uuid4())

        assert results == []

    async def test_does_not_reprocess_pre_categorized_charges(self) -> None:
        cat = make_category()
        stmt_id = uuid.uuid4()
        pre = make_charge(category_id=cat.id)
        pre.statement_id = stmt_id
        uncategorized = make_charge(category_id=None)
        uncategorized.statement_id = stmt_id

        ai_saw: list = []

        class TrackingCategorizer:
            async def categorize_batch(self, charges: list, categories: list) -> list:
                ai_saw.extend(charges)
                return charges

        service = CategorizationService(MockCategoryRepo([cat]), TrackingCategorizer())
        uc = CategorizeChargesUseCase(MockChargeRepo([pre, uncategorized]), MockCategoryRepo([cat]), service)
        await uc.execute(stmt_id, uuid.uuid4())

        ids_seen = [c.id for c in ai_saw]
        assert pre.id not in ids_seen
        assert uncategorized.id in ids_seen


# ── CategorizationService ─────────────────────────────────────────────────────

class _RuleMatchingCategoryRepo(MockCategoryRepo):
    def __init__(self, categories: list[Category], rule_category_id: uuid.UUID) -> None:
        super().__init__(categories)
        self._rule_cat_id = rule_category_id

    async def find_matching_rule(self, family_id: uuid.UUID, description: str) -> CategoryRule | None:
        return CategoryRule(
            id=uuid.uuid4(),
            family_id=family_id,
            pattern=description,
            category_id=self._rule_cat_id,
            created_at=datetime.now(UTC),
        )


class TestCategorizationService:
    async def test_rule_match_skips_ai_call(self) -> None:
        cat = make_category()
        charge = make_charge(description="NETFLIX")
        charge.category_id = None
        ai_called = False

        class TrackingCategorizer:
            async def categorize_batch(self, charges: list, categories: list) -> list:
                nonlocal ai_called
                ai_called = True
                return charges

        service = CategorizationService(_RuleMatchingCategoryRepo([cat], cat.id), TrackingCategorizer())
        results = await service.categorize([charge], [cat], uuid.uuid4())

        assert not ai_called
        assert results[0].category_id == cat.id
        assert results[0].ai_suggested is False

    async def test_no_rule_falls_back_to_ai(self) -> None:
        cat = make_category()
        charge = make_charge(description="TIENDA DESCONOCIDA 99X")
        charge.category_id = None
        ai_called = False

        class TrackingCategorizer:
            async def categorize_batch(self, charges: list, categories: list) -> list:
                nonlocal ai_called
                ai_called = True
                for c in charges:
                    c.category_id = cat.id
                    c.ai_suggested = True
                return charges

        service = CategorizationService(MockCategoryRepo([cat]), TrackingCategorizer())
        results = await service.categorize([charge], [cat], uuid.uuid4())

        assert ai_called
        assert results[0].ai_suggested is True

    async def test_mixed_batch_only_sends_unmatched_to_ai(self) -> None:
        cat = make_category()
        matched = make_charge(description="NETFLIX")
        matched.category_id = None
        unmatched = make_charge(description="UNKNOWN MERCHANT")
        unmatched.category_id = None
        ai_batch: list = []

        class PartialRuleRepo(MockCategoryRepo):
            async def find_matching_rule(self, family_id: uuid.UUID, description: str) -> CategoryRule | None:
                if description == "NETFLIX":
                    return CategoryRule(
                        id=uuid.uuid4(),
                        family_id=family_id,
                        pattern="NETFLIX",
                        category_id=cat.id,
                        created_at=datetime.now(UTC),
                    )
                return None

        class TrackingCategorizer:
            async def categorize_batch(self, charges: list, categories: list) -> list:
                ai_batch.extend(charges)
                return charges

        service = CategorizationService(PartialRuleRepo([cat]), TrackingCategorizer())
        await service.categorize([matched, unmatched], [cat], uuid.uuid4())

        ids = [c.id for c in ai_batch]
        assert matched.id not in ids
        assert unmatched.id in ids

    async def test_empty_input_returns_empty(self) -> None:
        service = CategorizationService(MockCategoryRepo(), _NullCategorizer())
        results = await service.categorize([], [], uuid.uuid4())
        assert results == []
