from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.entities.credit import Credit
from infrastructure.database.models import CreditModel


def _to_entity(m: CreditModel) -> Credit:
    return Credit(
        id=m.id,
        user_id=m.user_id,
        description=m.description,
        bank=m.bank,
        cuota_monto=m.cuota_monto,
        cuota_numero=m.cuota_numero,
        cuota_total=m.cuota_total,
        created_at=m.created_at,
    )


class SQLCreditRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_user(self, user_id: UUID) -> list[Credit]:
        result = await self._session.execute(
            select(CreditModel)
            .where(CreditModel.user_id == user_id)
            .order_by(CreditModel.created_at.desc())
        )
        return [_to_entity(m) for m in result.scalars().all()]

    async def get_by_id(self, credit_id: UUID) -> Credit | None:
        result = await self._session.execute(
            select(CreditModel).where(CreditModel.id == credit_id)
        )
        m = result.scalar_one_or_none()
        return _to_entity(m) if m else None

    async def create(
        self,
        user_id: UUID,
        description: str,
        bank: str | None,
        cuota_monto: int,
        cuota_numero: int,
        cuota_total: int,
    ) -> Credit:
        import uuid as _uuid
        m = CreditModel(
            id=_uuid.uuid4(),
            user_id=user_id,
            description=description,
            bank=bank,
            cuota_monto=cuota_monto,
            cuota_numero=cuota_numero,
            cuota_total=cuota_total,
        )
        self._session.add(m)
        await self._session.commit()
        await self._session.refresh(m)
        return _to_entity(m)

    async def update(
        self,
        credit_id: UUID,
        description: str,
        bank: str | None,
        cuota_monto: int,
        cuota_numero: int,
        cuota_total: int,
    ) -> Credit:
        result = await self._session.execute(
            select(CreditModel).where(CreditModel.id == credit_id)
        )
        m = result.scalar_one()
        m.description = description
        m.bank = bank
        m.cuota_monto = cuota_monto
        m.cuota_numero = cuota_numero
        m.cuota_total = cuota_total
        await self._session.commit()
        await self._session.refresh(m)
        return _to_entity(m)

    async def delete(self, credit_id: UUID) -> None:
        from sqlalchemy import delete
        await self._session.execute(
            delete(CreditModel).where(CreditModel.id == credit_id)
        )
        await self._session.commit()
