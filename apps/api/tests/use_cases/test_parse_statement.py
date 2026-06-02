"""Tests for ParseStatementUseCase."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from application.use_cases.parse_statement import ParseStatementUseCase
from domain.entities.charge import Charge, ParsedCharge
from domain.entities.statement import Statement
from domain.repositories.charge_repository import ChargeRepository
from domain.repositories.statement_repository import StatementRepository
from tests.conftest import TEST_FAMILY_ID, TEST_USER_ID


def _make_statement(
    *,
    statement_id: uuid.UUID | None = None,
    family_id: uuid.UUID = TEST_FAMILY_ID,
    filename: str = "jan.pdf",
    status: str = "pending",
) -> Statement:
    return Statement(
        id=statement_id or uuid.uuid4(),
        family_id=family_id,
        uploaded_by=TEST_USER_ID,
        filename=filename,
        type="checking",
        status=status,
        uploaded_at=datetime.now(UTC),
    )


def _make_parsed() -> ParsedCharge:
    return ParsedCharge(date=date(2026, 1, 15), description="STARBUCKS", amount=Decimal("3990"))


class MockStatementRepo(StatementRepository):
    def __init__(
        self,
        statement: Statement | None = None,
        prior: list[Statement] | None = None,
    ) -> None:
        self._statement = statement
        self._prior = prior or []
        self.status_updates: list[str] = []

    async def get_by_id(self, statement_id: uuid.UUID) -> Statement | None:
        return self._statement

    async def get_by_family(self, family_id: uuid.UUID, uploaded_by: uuid.UUID | None = None) -> list[Statement]:
        return []

    async def create(
        self,
        family_id: uuid.UUID,
        uploaded_by: uuid.UUID,
        filename: str,
        statement_type: str,
        storage_path: str | None,
        bank_hint: str | None,
    ) -> Statement:
        return self._statement or _make_statement()

    async def update_status(self, statement_id: uuid.UUID, status: str) -> Statement:
        self.status_updates.append(status)
        if self._statement:
            self._statement.status = status
        return self._statement or _make_statement()

    async def get_by_family_and_filename(
        self, family_id: uuid.UUID | None, filename: str, exclude_id: uuid.UUID
    ) -> list[Statement]:
        return self._prior

    async def delete(self, statement_id: uuid.UUID) -> None:
        pass

    async def update_type(self, statement_id: uuid.UUID, statement_type: str, bank_hint: str | None) -> Statement:
        return self._statement or _make_statement()


class MockChargeRepo(ChargeRepository):
    def __init__(self) -> None:
        self.deleted_statement_ids: list[uuid.UUID] = []
        self.bulk_created: list[ParsedCharge] = []

    async def get_by_id(self, charge_id: uuid.UUID) -> Charge | None:
        return None

    async def get_by_statement(self, statement_id: uuid.UUID) -> list[Charge]:
        return []

    async def get_by_family(
        self, family_id: uuid.UUID, month: int | None, year: int | None
    ) -> list[Charge]:
        return []

    async def get_personal(
        self, user_id: uuid.UUID, month: int | None, year: int | None
    ) -> list[Charge]:
        return []

    async def bulk_create(self, statement_id: uuid.UUID, charges: list[ParsedCharge]) -> list[Charge]:
        self.bulk_created.extend(charges)
        return []

    async def update_category(self, charge_id: uuid.UUID, category_id: uuid.UUID) -> Charge:
        raise NotImplementedError

    async def bulk_confirm(self, charge_ids: list[uuid.UUID]) -> int:
        return 0

    async def bulk_unshare(self, charge_ids: list[uuid.UUID]) -> int:
        return 0

    async def bulk_update_categories(self, charges: list[Charge]) -> None:
        pass

    async def delete_by_statement(self, statement_id: uuid.UUID) -> int:
        self.deleted_statement_ids.append(statement_id)
        return 0

    async def delete(self, charge_id: uuid.UUID) -> None:
        pass

    async def get_confirmed_by_family(
        self, family_id: uuid.UUID, month: int | None, year: int | None
    ) -> list[Charge]:
        return []

    async def count_similar(
        self, uploaded_by: uuid.UUID, pattern: str, exclude_id: uuid.UUID, exclude_category_id: uuid.UUID
    ) -> int:
        return 0

    async def apply_category_by_pattern(
        self, uploaded_by: uuid.UUID, pattern: str, category_id: uuid.UUID, exclude_id: uuid.UUID
    ) -> int:
        return 0


class MockParser:
    def __init__(self, result: list[ParsedCharge] | None = None, raise_exc: Exception | None = None) -> None:
        self._result = result or []
        self._raise = raise_exc

    async def parse(self, file_bytes: bytes, filename: str) -> list[ParsedCharge]:
        if self._raise:
            raise self._raise
        return self._result


class TestParseStatementExecute:
    async def test_transitions_status_parsing_then_parsed(self) -> None:
        stmt = _make_statement()
        stmt_repo = MockStatementRepo(statement=stmt)
        uc = ParseStatementUseCase(stmt_repo, MockChargeRepo(), MockParser([_make_parsed()]))

        await uc.execute(stmt.id, b"bytes", "jan.pdf")

        assert stmt_repo.status_updates == ["parsing", "parsed"]

    async def test_bulk_creates_parsed_charges(self) -> None:
        stmt = _make_statement()
        parsed = [_make_parsed(), _make_parsed()]
        charge_repo = MockChargeRepo()
        uc = ParseStatementUseCase(MockStatementRepo(statement=stmt), charge_repo, MockParser(parsed))

        result = await uc.execute(stmt.id, b"bytes", "jan.pdf")

        assert len(result) == 2
        assert len(charge_repo.bulk_created) == 2

    async def test_deletes_prior_statement_charges_for_same_filename(self) -> None:
        prior_id = uuid.uuid4()
        prior = _make_statement(statement_id=prior_id, filename="jan.pdf")
        current = _make_statement(filename="jan.pdf")
        charge_repo = MockChargeRepo()
        uc = ParseStatementUseCase(
            MockStatementRepo(statement=current, prior=[prior]),
            charge_repo,
            MockParser([_make_parsed()]),
        )

        await uc.execute(current.id, b"bytes", "jan.pdf")

        assert prior_id in charge_repo.deleted_statement_ids

    async def test_no_prior_statements_skips_delete(self) -> None:
        stmt = _make_statement()
        charge_repo = MockChargeRepo()
        uc = ParseStatementUseCase(
            MockStatementRepo(statement=stmt, prior=[]),
            charge_repo,
            MockParser([_make_parsed()]),
        )

        await uc.execute(stmt.id, b"bytes", "new.pdf")

        assert charge_repo.deleted_statement_ids == []

    async def test_sets_status_error_on_parse_failure(self) -> None:
        stmt = _make_statement()
        stmt_repo = MockStatementRepo(statement=stmt)
        uc = ParseStatementUseCase(stmt_repo, MockChargeRepo(), MockParser(raise_exc=RuntimeError("bad file")))

        with pytest.raises(RuntimeError):
            await uc.execute(stmt.id, b"bad", "bad.pdf")

        assert stmt_repo.status_updates[-1] == "error"

    async def test_parsing_status_is_set_before_error_status(self) -> None:
        stmt = _make_statement()
        stmt_repo = MockStatementRepo(statement=stmt)
        uc = ParseStatementUseCase(stmt_repo, MockChargeRepo(), MockParser(raise_exc=ValueError("parse error")))

        with pytest.raises(ValueError):
            await uc.execute(stmt.id, b"bad", "bad.pdf")

        assert stmt_repo.status_updates == ["parsing", "error"]

    async def test_returns_list_of_parsed_charges(self) -> None:
        stmt = _make_statement()
        parsed = [_make_parsed()]
        uc = ParseStatementUseCase(MockStatementRepo(statement=stmt), MockChargeRepo(), MockParser(parsed))

        result = await uc.execute(stmt.id, b"bytes", "jan.pdf")

        assert result == parsed
