"""Unit tests for ClaudeParser._parse_response's cuota field coercion.

Regression coverage for a bug where a brand-new installment purchase — shown
as "00/X" on the statement (first month, not yet billed) — had its
cuota_numero silently dropped to None because the code used a truthy check
(`if item.get("cuota_numero")`), and 0 is falsy in Python.
"""
from __future__ import annotations

import json
from datetime import date
from decimal import Decimal

from domain.entities.charge import ParsedCharge
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


def _charge(day: str, cuota_numero: int | None = None) -> ParsedCharge:
    return ParsedCharge(
        date=date.fromisoformat(day), description="X", amount=Decimal("1000"), cuota_numero=cuota_numero,
    )


class TestHarmonizeChunkYears:
    """Regression: Itaú checking cartolas print DD/MM dates and show the year only in
    the page-1 header, so a later page chunk came back as 2024 for a 2026 statement."""

    def test_shifts_later_chunk_with_misguessed_year(self) -> None:
        chunks = [
            [_charge("2026-09-01"), _charge("2026-09-14")],
            [_charge("2024-09-15"), _charge("2024-09-29")],
            [_charge("2026-09-30")],
        ]

        result = ClaudeParser._harmonize_chunk_years(chunks)

        assert [c.date.isoformat() for c in result[1]] == ["2026-09-15", "2026-09-29"]
        assert result[0] == chunks[0]
        assert result[2] == chunks[2]

    def test_keeps_chunk_with_installments(self) -> None:
        # Old cuota purchases legitimately carry prior-year dates.
        chunks = [[_charge("2026-09-01")], [_charge("2025-09-10", cuota_numero=4)]]

        result = ClaudeParser._harmonize_chunk_years(chunks)

        assert result[1][0].date == date(2025, 9, 10)

    def test_keeps_chunk_with_months_outside_reference_period(self) -> None:
        chunks = [[_charge("2026-09-01")], [_charge("2025-12-20")]]

        result = ClaudeParser._harmonize_chunk_years(chunks)

        assert result[1][0].date == date(2025, 12, 20)

    def test_keeps_chunk_already_mixing_years(self) -> None:
        chunks = [[_charge("2026-01-02")], [_charge("2025-12-30"), _charge("2026-01-03")]]

        result = ClaudeParser._harmonize_chunk_years(chunks)

        assert result[1] == chunks[1]

    def test_single_chunk_untouched(self) -> None:
        chunks = [[_charge("2024-09-15")]]

        assert ClaudeParser._harmonize_chunk_years(chunks) == chunks


class TestParsePdfPagesHeaderContext:
    async def test_later_chunks_get_page_one_header(self) -> None:
        parser = ClaudeParser()
        parser._client = object()  # bypass the "no client" guard; _call_claude is stubbed
        seen: list[str] = []

        async def fake_call(content: str, filename: str) -> list[ParsedCharge]:
            seen.append(content)
            return []

        parser._call_claude = fake_call  # type: ignore[method-assign]
        pages = ["Periodo: 01/09/2026 - 30/09/2026\n01/09 UBER 1.000", "p2", "p3", "p4"]

        await parser.parse_pdf_pages(pages, "cc sept.pdf")

        assert len(seen) == 2
        assert "END OF HEADER CONTEXT" not in seen[0]
        assert "Periodo: 01/09/2026" in seen[1] and seen[1].endswith("p4")
