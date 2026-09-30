"""Tests for the amortization back-solve used to split a fixed installment
into its interest and capital parts from the current outstanding balance."""
from __future__ import annotations

from decimal import Decimal

from application.services.amortization_service import implied_monthly_rate, monthly_breakdown


class TestImpliedMonthlyRate:
    def test_zero_interest_loan_solves_to_zero_rate(self) -> None:
        # 10 periods, no interest: payment is exactly principal / n
        rate = implied_monthly_rate(Decimal("10000"), Decimal("1000"), 10)
        assert rate == Decimal(0)

    def test_known_annuity_matches_expected_rate(self) -> None:
        # 1% monthly, 12 periods, principal 10000 -> payment ~888.49
        principal = Decimal("10000")
        n = 12
        expected_rate = Decimal("0.01")
        growth = (1 + expected_rate) ** n
        payment = (principal * expected_rate * growth / (growth - 1)).quantize(Decimal("0.01"))

        rate = implied_monthly_rate(principal, payment, n)

        assert abs(rate - expected_rate) < Decimal("0.0005")

    def test_single_remaining_period_uses_direct_formula(self) -> None:
        # Last installment: principal 100000, payment 105000 -> rate 5%
        rate = implied_monthly_rate(Decimal("100000"), Decimal("105000"), 1)
        assert rate == Decimal("0.05")

    def test_invalid_inputs_return_zero(self) -> None:
        assert implied_monthly_rate(Decimal(0), Decimal("1000"), 10) == Decimal(0)
        assert implied_monthly_rate(Decimal("1000"), Decimal(0), 10) == Decimal(0)
        assert implied_monthly_rate(Decimal("1000"), Decimal("100"), 0) == Decimal(0)


class TestMonthlyBreakdown:
    def test_splits_payment_into_interest_and_capital(self) -> None:
        # Matches the real Credito Consumo figures verified against the bank app
        result = monthly_breakdown(Decimal("10777409"), Decimal("426674"), 31)

        assert result["interest"] + result["capital"] == Decimal("426674")
        assert Decimal("140000") < result["interest"] < Decimal("150000")

    def test_zero_interest_loan_is_all_capital(self) -> None:
        result = monthly_breakdown(Decimal("10000"), Decimal("1000"), 10)

        assert result["interest"] == Decimal(0)
        assert result["capital"] == Decimal("1000")

    def test_payment_too_small_for_any_positive_rate_falls_back_to_all_capital(self) -> None:
        # payment well below principal/n -> implied_monthly_rate short-circuits to 0
        result = monthly_breakdown(Decimal("100000000"), Decimal("1"), 5)

        assert result["interest"] == Decimal(0)
        assert result["capital"] == Decimal("1")
