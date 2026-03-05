"""Unit tests for domain entities."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from domain.entities.category import Category, CategoryRule
from domain.entities.charge import Charge, ParsedCharge
from domain.entities.statement import Statement


class TestCharge:
    def test_charge_defaults(self):
        charge = Charge(
            id=uuid.uuid4(),
            statement_id=uuid.uuid4(),
            date=date(2026, 3, 1),
            description="Netflix",
            amount=Decimal("9990"),
            currency="CLP",
            is_shared=False,
            ai_suggested=False,
            created_at=datetime.now(timezone.utc),
        )
        assert charge.category_id is None
        assert charge.statement_type == ""
        assert charge.uploaded_by is None

    def test_charge_is_shared_default_false(self):
        charge = Charge(
            id=uuid.uuid4(),
            statement_id=uuid.uuid4(),
            date=date(2026, 1, 1),
            description="Uber",
            amount=Decimal("3500"),
            currency="CLP",
            is_shared=False,
            ai_suggested=False,
            created_at=datetime.now(timezone.utc),
        )
        assert charge.is_shared is False

    def test_charge_with_category(self):
        cat_id = uuid.uuid4()
        charge = Charge(
            id=uuid.uuid4(),
            statement_id=uuid.uuid4(),
            date=date(2026, 2, 14),
            description="Jumbo",
            amount=Decimal("45000"),
            currency="CLP",
            is_shared=True,
            ai_suggested=True,
            category_id=cat_id,
            created_at=datetime.now(timezone.utc),
        )
        assert charge.category_id == cat_id
        assert charge.is_shared is True
        assert charge.ai_suggested is True


class TestParsedCharge:
    def test_parsed_charge_currency_default(self):
        pc = ParsedCharge(
            date=date(2026, 3, 1),
            description="Copec",
            amount=Decimal("25000"),
        )
        assert pc.currency == "CLP"

    def test_parsed_charge_custom_currency(self):
        pc = ParsedCharge(
            date=date(2026, 3, 1),
            description="Amazon",
            amount=Decimal("9.99"),
            currency="USD",
        )
        assert pc.currency == "USD"


class TestCategory:
    def test_category_system(self):
        cat = Category(
            id=uuid.uuid4(),
            name="Alimentación",
            is_system=True,
            created_at=datetime.now(timezone.utc),
        )
        assert cat.is_system is True
        assert cat.family_id is None
        assert cat.color is None

    def test_category_family_scoped(self):
        fam_id = uuid.uuid4()
        cat = Category(
            id=uuid.uuid4(),
            name="Mascota",
            is_system=False,
            family_id=fam_id,
            color="#FF5733",
            created_at=datetime.now(timezone.utc),
        )
        assert cat.family_id == fam_id
        assert cat.color == "#FF5733"


class TestStatement:
    def test_statement_personal_no_family(self):
        stmt = Statement(
            id=uuid.uuid4(),
            family_id=None,
            uploaded_by=uuid.uuid4(),
            filename="Gastos Manuales",
            type="checking",
            status="parsed",
            uploaded_at=datetime.now(timezone.utc),
            bank_hint="manual",
        )
        assert stmt.family_id is None
        assert stmt.bank_hint == "manual"

    def test_statement_family_scoped(self):
        fam_id = uuid.uuid4()
        stmt = Statement(
            id=uuid.uuid4(),
            family_id=fam_id,
            uploaded_by=uuid.uuid4(),
            filename="cartola_enero.pdf",
            type="credit_card",
            status="pending",
            uploaded_at=datetime.now(timezone.utc),
        )
        assert stmt.family_id == fam_id
        assert stmt.type == "credit_card"
