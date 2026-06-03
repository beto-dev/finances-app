from collections import Counter
from dataclasses import replace
from datetime import date
from uuid import UUID

from application.services.parser_service import ParserService
from domain.entities.charge import ParsedCharge
from domain.repositories.charge_repository import ChargeRepository
from domain.repositories.statement_repository import StatementRepository


def _align_dates_to_statement_month(charges: list[ParsedCharge]) -> list[ParsedCharge]:
    """Move end-of-previous-month charges into the statement's majority month.

    Chilean bank cartolas sometimes include charges from the last 1-3 days of
    the prior month (e.g. Dec 31 in a January cartola). Those charges would
    otherwise appear in December's view, confusing reconciliation. We detect the
    majority month and move any charge that falls in the immediately preceding
    month on day >= 28 to the 1st of the majority month.
    """
    if not charges:
        return charges

    month_counts: Counter = Counter((c.date.year, c.date.month) for c in charges)
    (maj_year, maj_month), _ = month_counts.most_common(1)[0]

    prev_month = maj_month - 1 if maj_month > 1 else 12
    prev_year = maj_year if maj_month > 1 else maj_year - 1

    result = []
    for c in charges:
        if c.date.year == prev_year and c.date.month == prev_month and c.date.day >= 28:
            c = replace(c, date=date(maj_year, maj_month, 1))
        result.append(c)
    return result


class ParseStatementUseCase:
    def __init__(
        self,
        statement_repo: StatementRepository,
        charge_repo: ChargeRepository,
        parser_service: ParserService,
    ) -> None:
        self._statements = statement_repo
        self._charges = charge_repo
        self._parser = parser_service

    async def execute(self, statement_id: UUID, file_bytes: bytes, filename: str) -> list[ParsedCharge]:
        await self._statements.update_status(statement_id, "parsing")
        try:
            parsed = await self._parser.parse(file_bytes, filename)
            parsed = _align_dates_to_statement_month(parsed)

            # Delete charges from any prior statement with the same filename in this family
            current = await self._statements.get_by_id(statement_id)
            if current:
                prior = await self._statements.get_by_family_and_filename(
                    current.family_id, filename, exclude_id=statement_id
                )
                for s in prior:
                    await self._charges.delete_by_statement(s.id)

            await self._charges.bulk_create(statement_id, parsed)
            await self._statements.update_status(statement_id, "parsed")
            return parsed
        except Exception:
            await self._statements.update_status(statement_id, "error")
            raise
