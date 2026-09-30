"""Unit tests for ClaudeParser._parse_response's cuota field coercion.

Regression coverage for a bug where a brand-new installment purchase — shown
as "00/X" on the statement (first month, not yet billed) — had its
cuota_numero silently dropped to None because the code used a truthy check
(`if item.get("cuota_numero")`), and 0 is falsy in Python.
"""
from __future__ import annotations

import json
from decimal import Decimal

from infrastructure.ai.claude_parser import ClaudeParser


def _response(items: list[dict]) -> str:
    return json.dumps(items)


class TestParseResponseCuotaFields:
    def test_preserves_cuota_numero_zero(self) -> None:
        parser = ClaudeParser()
        text = _response([{
            "date": "2026-09-16", "description": "DECATHLON VESPUCIO", "amount": 38333,
            "cuota_numero": 0, "cuota_total": 3, "cuota_monto": 38333,
        }])

        charges = parser._parse_response(text)

        assert len(charges) == 1
        assert charges[0].cuota_numero == 0
        assert charges[0].cuota_total == 3
        assert charges[0].cuota_monto == Decimal("38333")

    def test_null_cuota_fields_stay_none(self) -> None:
        parser = ClaudeParser()
        text = _response([{
            "date": "2026-09-09", "description": "TRASPASO A DEUDA NACIONAL", "amount": 174445,
            "cuota_numero": None, "cuota_total": None, "cuota_monto": None,
        }])

        charges = parser._parse_response(text)

        assert charges[0].cuota_numero is None
        assert charges[0].cuota_total is None
        assert charges[0].cuota_monto is None

    def test_missing_cuota_keys_default_to_none(self) -> None:
        parser = ClaudeParser()
        text = _response([{"date": "2026-09-09", "description": "UBER TRIP", "amount": 5000}])

        charges = parser._parse_response(text)

        assert charges[0].cuota_numero is None
        assert charges[0].cuota_total is None
        assert charges[0].cuota_monto is None

    def test_preserves_nonzero_cuota_numero(self) -> None:
        parser = ClaudeParser()
        text = _response([{
            "date": "2026-06-17", "description": "MP *MERCADO LIBRE", "amount": 27063,
            "cuota_numero": 4, "cuota_total": 12, "cuota_monto": 27063,
        }])

        charges = parser._parse_response(text)

        assert charges[0].cuota_numero == 4
        assert charges[0].cuota_total == 12
