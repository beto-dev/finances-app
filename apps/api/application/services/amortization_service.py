from decimal import ROUND_HALF_UP, Decimal


def implied_monthly_rate(principal: Decimal, payment: Decimal, n_periods: int) -> Decimal:
    """Back-solve the periodic rate of a fixed-installment (French/annuity) loan.

    payment = principal * r / (1 - (1 + r) ** -n)

    There's no closed form for r, so this bisects on [0, 1] — no real consumer
    loan carries a >100%-per-period rate, so 1 is a safe upper bound.
    """
    if n_periods <= 0 or principal <= 0 or payment <= 0:
        return Decimal(0)
    if n_periods == 1:
        rate = (payment - principal) / principal
        return rate if rate > 0 else Decimal(0)

    flat_payment = principal / n_periods
    if payment <= flat_payment:
        return Decimal(0)

    def payment_at(rate: Decimal) -> Decimal:
        growth = (1 + rate) ** n_periods
        return principal * rate * growth / (growth - 1)

    low, high = Decimal(0), Decimal(1)
    for _ in range(60):
        mid = (low + high) / 2
        if payment_at(mid) < payment:
            low = mid
        else:
            high = mid
    return (low + high) / 2


def monthly_breakdown(principal: Decimal, payment: Decimal, n_periods: int) -> dict[str, Decimal]:
    """Split the next installment into its interest and capital (principal) parts,
    given the current outstanding balance and the remaining number of installments."""
    rate = implied_monthly_rate(principal, payment, n_periods)
    interest = (principal * rate).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    capital = payment - interest
    if capital < 0:
        interest, capital = payment, Decimal(0)
    return {"monthly_rate": rate, "interest": interest, "capital": capital}
