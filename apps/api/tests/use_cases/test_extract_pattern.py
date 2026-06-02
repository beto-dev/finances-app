"""Parametrized tests for extract_pattern() — the noise-stripping logic used in CategoryRule matching."""
from __future__ import annotations

import pytest

from application.use_cases.review_charges import extract_pattern


@pytest.mark.parametrize("description,expected", [
    # Trailing pure-digit tokens are stripped
    ("UBER TRIP 12345", "UBER TRIP"),
    ("LIDER EXPRESS 001", "LIDER EXPRESS"),
    # Trailing alphanumeric codes (mixed letters + digits) are stripped
    ("RAPPI DELIVERY A1B2C3", "RAPPI DELIVERY"),
    ("PAGO REF X7Y8Z9", "PAGO REF"),
    # Slashes and dots with embedded digits are stripped
    ("PAGO/TRF 12/05", "PAGO/TRF"),
    # Last token with only letters is kept
    ("NETFLIX CHILE", "NETFLIX CHILE"),
    ("FALABELLA RETIRO CLP", "FALABELLA RETIRO CLP"),
    # Multiple trailing noise tokens are all stripped
    ("TRANSFERENCIA 9876 A1B2", "TRANSFERENCIA"),
    # Single token is never stripped even if it looks numeric
    ("12345", "12345"),
    ("A1B2C3", "A1B2C3"),
    # Leading/trailing whitespace is ignored
    ("  UBER TRIP 001  ", "UBER TRIP"),
    # Single clean word unchanged
    ("STARBUCKS", "STARBUCKS"),
    # Hyphenated code with digits stripped
    ("MERCADO LIBRE TXN-00123", "MERCADO LIBRE"),
])
def test_extract_pattern(description: str, expected: str) -> None:
    assert extract_pattern(description) == expected
