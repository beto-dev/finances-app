"""Tests for UploadStatementUseCase."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from application.use_cases.upload_statement import UploadStatementUseCase
from domain.entities.statement import Statement
from domain.repositories.statement_repository import StatementRepository
from infrastructure.storage.supabase_storage import SupabaseStorage
from tests.conftest import TEST_FAMILY_ID, TEST_USER_ID


def _make_statement(storage_path: str = "statements/family/jan.pdf") -> Statement:
    return Statement(
        id=uuid.uuid4(),
        family_id=TEST_FAMILY_ID,
        uploaded_by=TEST_USER_ID,
        filename="jan.pdf",
        type="checking",
        status="pending",
        uploaded_at=datetime.now(UTC),
        storage_path=storage_path,
    )


class MockStatementRepo(StatementRepository):
    def __init__(self) -> None:
        self.created: list[dict] = []

    async def get_by_id(self, statement_id: uuid.UUID) -> Statement | None:
        return None

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
        self.created.append(
            dict(
                family_id=family_id,
                uploaded_by=uploaded_by,
                filename=filename,
                statement_type=statement_type,
                storage_path=storage_path,
                bank_hint=bank_hint,
            )
        )
        return _make_statement(storage_path=storage_path or "")

    async def update_status(self, statement_id: uuid.UUID, status: str) -> Statement:
        return _make_statement()

    async def get_by_family_and_filename(
        self, family_id: uuid.UUID | None, filename: str, exclude_id: uuid.UUID
    ) -> list[Statement]:
        return []

    async def delete(self, statement_id: uuid.UUID) -> None:
        pass

    async def update_type(self, statement_id: uuid.UUID, statement_type: str, bank_hint: str | None) -> Statement:
        return _make_statement()


class MockStorage(SupabaseStorage):
    def __init__(self, path: str = "statements/family/jan.pdf") -> None:
        self._path = path
        self.upload_calls: list[dict] = []

    async def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> str:
        self.upload_calls.append(dict(bucket=bucket, path=path, data=data, content_type=content_type))
        return self._path


class TestUploadStatementExecute:
    async def test_uploads_to_storage_before_creating_record(self) -> None:
        storage = MockStorage(path="statements/bb/jan.pdf")
        repo = MockStatementRepo()
        uc = UploadStatementUseCase(repo, storage)

        await uc.execute(
            family_id=TEST_FAMILY_ID,
            uploaded_by=TEST_USER_ID,
            filename="jan.pdf",
            file_bytes=b"content",
            content_type="application/pdf",
        )

        assert len(storage.upload_calls) == 1
        assert len(repo.created) == 1
        assert repo.created[0]["storage_path"] == "statements/bb/jan.pdf"

    async def test_storage_path_is_family_scoped(self) -> None:
        storage = MockStorage()
        repo = MockStatementRepo()
        uc = UploadStatementUseCase(repo, storage)

        await uc.execute(
            family_id=TEST_FAMILY_ID,
            uploaded_by=TEST_USER_ID,
            filename="jan.pdf",
            file_bytes=b"x",
            content_type="application/pdf",
        )

        expected_path = f"{TEST_FAMILY_ID}/jan.pdf"
        assert storage.upload_calls[0]["path"] == expected_path

    async def test_passes_bank_hint_to_repo(self) -> None:
        storage = MockStorage()
        repo = MockStatementRepo()
        uc = UploadStatementUseCase(repo, storage)

        await uc.execute(
            family_id=TEST_FAMILY_ID,
            uploaded_by=TEST_USER_ID,
            filename="bci.pdf",
            file_bytes=b"x",
            content_type="application/pdf",
            bank_hint="BCI",
        )

        assert repo.created[0]["bank_hint"] == "BCI"

    async def test_passes_statement_type_to_repo(self) -> None:
        storage = MockStorage()
        repo = MockStatementRepo()
        uc = UploadStatementUseCase(repo, storage)

        await uc.execute(
            family_id=TEST_FAMILY_ID,
            uploaded_by=TEST_USER_ID,
            filename="tarjeta.pdf",
            file_bytes=b"x",
            content_type="application/pdf",
            statement_type="credit_card",
        )

        assert repo.created[0]["statement_type"] == "credit_card"

    async def test_uploads_file_bytes_to_correct_bucket(self) -> None:
        storage = MockStorage()
        repo = MockStatementRepo()
        uc = UploadStatementUseCase(repo, storage)

        await uc.execute(
            family_id=TEST_FAMILY_ID,
            uploaded_by=TEST_USER_ID,
            filename="jan.pdf",
            file_bytes=b"file data",
            content_type="application/pdf",
        )

        call = storage.upload_calls[0]
        assert call["bucket"] == "statements"
        assert call["data"] == b"file data"
        assert call["content_type"] == "application/pdf"
