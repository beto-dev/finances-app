from uuid import UUID

from domain.entities.statement import Statement
from domain.repositories.statement_repository import StatementRepository
from infrastructure.storage.supabase_storage import SupabaseStorage


class UploadStatementUseCase:
    def __init__(self, statement_repo: StatementRepository, storage: SupabaseStorage) -> None:
        self._repo = statement_repo
        self._storage = storage

    async def execute(
        self,
        family_id: UUID,
        uploaded_by: UUID,
        filename: str,
        file_bytes: bytes,
        content_type: str,
        statement_type: str = "checking",
        bank_hint: str | None = None,
    ) -> Statement:
        storage_path = await self._storage.upload(
            bucket="statements",
            path=f"{family_id}/{filename}",
            data=file_bytes,
            content_type=content_type,
        )
        return await self._repo.create(
            family_id=family_id,
            uploaded_by=uploaded_by,
            filename=filename,
            statement_type=statement_type,
            storage_path=storage_path,
            bank_hint=bank_hint,
        )
