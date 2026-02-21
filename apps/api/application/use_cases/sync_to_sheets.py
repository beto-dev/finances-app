from uuid import UUID
from domain.repositories.charge_repository import ChargeRepository
from domain.repositories.category_repository import CategoryRepository
from infrastructure.google.sheets_client import SheetsClient


class SyncToSheetsUseCase:
    def __init__(
        self,
        charge_repo: ChargeRepository,
        category_repo: CategoryRepository,
        sheets_client: SheetsClient,
    ) -> None:
        self._charges = charge_repo
        self._categories = category_repo
        self._sheets = sheets_client

    async def execute(self, family_id: UUID, spreadsheet_id: str, access_token: str) -> dict:
        charges = await self._charges.get_by_family(family_id, month=None, year=None)
        confirmed = [c for c in charges if c.is_confirmed]
        result = await self._sheets.sync_charges(spreadsheet_id, confirmed, access_token)
        return result
