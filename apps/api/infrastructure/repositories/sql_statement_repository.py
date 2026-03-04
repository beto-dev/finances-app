from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.entities.statement import Statement
from domain.repositories.statement_repository import StatementRepository
from infrastructure.database.models import StatementModel


def _to_entity(m: StatementModel) -> Statement:
    return Statement(
        id=m.id, family_id=m.family_id, uploaded_by=m.uploaded_by,
        filename=m.filename, type=m.type, status=m.status,
        uploaded_at=m.uploaded_at, storage_path=m.storage_path, bank_hint=m.bank_hint,
    )


class SQLStatementRepository(StatementRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, statement_id: UUID) -> Statement | None:
        result = await self._session.execute(select(StatementModel).where(StatementModel.id == statement_id))
        m = result.scalar_one_or_none()
        return _to_entity(m) if m else None

    async def get_by_family(self, family_id: UUID, uploaded_by: UUID | None = None) -> list[Statement]:
        stmt = select(StatementModel).where(StatementModel.family_id == family_id)
        if uploaded_by is not None:
            stmt = stmt.where(StatementModel.uploaded_by == uploaded_by)
        result = await self._session.execute(stmt.order_by(StatementModel.uploaded_at.desc()))
        return [_to_entity(m) for m in result.scalars().all()]

    async def create(
        self, family_id: UUID, uploaded_by: UUID, filename: str,
        statement_type: str, storage_path: str | None, bank_hint: str | None,
    ) -> Statement:
        m = StatementModel(
            family_id=family_id, uploaded_by=uploaded_by, filename=filename,
            type=statement_type, storage_path=storage_path, bank_hint=bank_hint,
        )
        self._session.add(m)
        await self._session.commit()
        await self._session.refresh(m)
        return _to_entity(m)

    async def get_by_family_and_filename(self, family_id: UUID | None, filename: str, exclude_id: UUID) -> list[Statement]:
        result = await self._session.execute(
            select(StatementModel).where(
                StatementModel.family_id == family_id,
                StatementModel.filename == filename,
                StatementModel.id != exclude_id,
            )
        )
        return [_to_entity(m) for m in result.scalars().all()]

    async def update_status(self, statement_id: UUID, status: str) -> Statement:
        result = await self._session.execute(select(StatementModel).where(StatementModel.id == statement_id))
        m = result.scalar_one()
        m.status = status
        await self._session.commit()
        await self._session.refresh(m)
        return _to_entity(m)
