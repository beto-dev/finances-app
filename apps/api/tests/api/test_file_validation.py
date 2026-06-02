"""Tests for _validate_file() — the file type and size guard on statement uploads."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from presentation.api.statements import _validate_file

_PDF = b"%PDF-1.4 " + b"x" * 200
_XLSX = b"PK\x03\x04" + b"\x00" * 200
_CSV = b"date,amount,description\n2026-01-01,1000,STARBUCKS\n"


class TestValidateFile:
    def test_accepts_valid_pdf_by_magic_bytes(self) -> None:
        _validate_file("statement.pdf", _PDF, "application/pdf")

    def test_accepts_valid_xlsx_by_magic_bytes(self) -> None:
        _validate_file(
            "statement.xlsx",
            _XLSX,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    def test_accepts_csv_with_text_csv_content_type(self) -> None:
        _validate_file("statement.csv", _CSV, "text/csv")

    def test_accepts_csv_with_text_plain_content_type(self) -> None:
        _validate_file("statement.csv", _CSV, "text/plain")

    def test_accepts_csv_with_octet_stream_content_type(self) -> None:
        _validate_file("statement.csv", _CSV, "application/octet-stream")

    def test_rejects_file_exceeding_10mb(self) -> None:
        big = b"a" * (11 * 1024 * 1024)
        with pytest.raises(HTTPException) as exc:
            _validate_file("big.pdf", big, "application/pdf")
        assert exc.value.status_code == 413

    def test_rejects_html_disguised_as_pdf(self) -> None:
        html = b"<html><body>phishing</body></html>"
        with pytest.raises(HTTPException) as exc:
            _validate_file("fake.pdf", html, "application/pdf")
        assert exc.value.status_code == 400

    def test_rejects_executable_binary(self) -> None:
        exe = b"\x4d\x5a" + b"\x00" * 100  # Windows PE header
        with pytest.raises(HTTPException) as exc:
            _validate_file("malware.exe", exe, "application/octet-stream")
        assert exc.value.status_code == 400

    def test_rejects_file_at_exactly_10mb(self) -> None:
        at_limit = b"a" * (10 * 1024 * 1024 + 1)
        with pytest.raises(HTTPException) as exc:
            _validate_file("big.pdf", at_limit, "application/pdf")
        assert exc.value.status_code == 413

    def test_rejects_extensionless_file_with_no_magic(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_file("noext", b"random bytes here", "application/octet-stream")
        assert exc.value.status_code == 400

    def test_file_just_under_10mb_is_accepted(self) -> None:
        _validate_file("big.pdf", _PDF + b"x" * (10 * 1024 * 1024 - len(_PDF)), "application/pdf")
