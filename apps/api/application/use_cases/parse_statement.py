from uuid import UUID
from domain.entities.charge import ParsedCharge
from domain.entities.statement import Statement
from domain.repositories.charge_repository import ChargeRepository
from domain.repositories.statement_repository import StatementRepository
from application.services.parser_service import ParserService


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
