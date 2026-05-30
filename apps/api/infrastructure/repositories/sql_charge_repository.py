from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from domain.entities.charge import Charge, ParsedCharge
from domain.repositories.charge_repository import ChargeRepository
from infrastructure.database.models import ChargeModel, StatementModel


def _to_entity(m: ChargeModel) -> Charge:
    return Charge(
        id=m.id, statement_id=m.statement_id, date=m.date,
        description=m.description, amount=Decimal(str(m.amount)),
        currency=m.currency, category_id=m.category_id,
        is_shared=m.is_shared, ai_suggested=m.ai_suggested,
        created_at=m.created_at,
        cuota_numero=m.cuota_numero,
        cuota_total=m.cuota_total,
        cuota_monto=Decimal(str(m.cuota_monto)) if m.cuota_monto is not None else None,
    )


class SQLChargeRepository(ChargeRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, charge_id: UUID) -> Charge | None:
        result = await self._session.execute(select(ChargeModel).where(ChargeModel.id == charge_id))
        m = result.scalar_one_or_none()
        return _to_entity(m) if m else None

    async def get_by_statement(self, statement_id: UUID) -> list[Charge]:
        result = await self._session.execute(
            select(ChargeModel).where(ChargeModel.statement_id == statement_id)
            .order_by(ChargeModel.date.desc())
        )
        return [_to_entity(m) for m in result.scalars().all()]

    async def get_by_family(
        self, family_id: UUID, month: int | None, year: int | None, uploaded_by_filter: UUID | None = None
    ) -> list[Charge]:
        from sqlalchemy import extract
        stmt = (
            select(ChargeModel, StatementModel.type, StatementModel.uploaded_by)
            .join(StatementModel, ChargeModel.statement_id == StatementModel.id)
            .where(StatementModel.family_id == family_id)
        )
        if uploaded_by_filter is not None:
            stmt = stmt.where(StatementModel.uploaded_by == uploaded_by_filter)
        if month is not None:
            stmt = stmt.where(extract("month", ChargeModel.date) == month)
        if year is not None:
            stmt = stmt.where(extract("year", ChargeModel.date) == year)
        result = await self._session.execute(stmt.order_by(ChargeModel.date.desc()))
        charges = []
        for row in result.all():
            charge = _to_entity(row[0])
            charge.statement_type = row[1] or ""
            charge.uploaded_by = row[2]
            charges.append(charge)
        return charges

    async def get_personal(self, user_id: UUID, month: int | None = None, year: int | None = None) -> list[Charge]:
        from sqlalchemy import extract
        stmt = (
            select(ChargeModel, StatementModel.type, StatementModel.uploaded_by, StatementModel.bank_hint)
            .join(StatementModel, ChargeModel.statement_id == StatementModel.id)
            .where(StatementModel.uploaded_by == user_id)
            .where(StatementModel.family_id.is_(None))
        )
        if month is not None:
            stmt = stmt.where(extract("month", ChargeModel.date) == month)
        if year is not None:
            stmt = stmt.where(extract("year", ChargeModel.date) == year)
        result = await self._session.execute(stmt.order_by(ChargeModel.date.desc()))
        charges = []
        for row in result.all():
            charge = _to_entity(row[0])
            bank_hint = row[3]
            charge.statement_type = "manual" if bank_hint == "manual" else (row[1] or "")
            charge.uploaded_by = row[2]
            charges.append(charge)
        return charges

    async def get_confirmed_by_family(self, family_id: UUID, month: int | None, year: int | None) -> list[Charge]:
        from sqlalchemy import extract
        stmt = (
            select(ChargeModel, StatementModel.type, StatementModel.uploaded_by)
            .join(StatementModel, ChargeModel.statement_id == StatementModel.id)
            .where(StatementModel.family_id == family_id)
            .where(ChargeModel.is_shared == True)  # noqa: E712
        )
        if month is not None:
            stmt = stmt.where(extract("month", ChargeModel.date) == month)
        if year is not None:
            stmt = stmt.where(extract("year", ChargeModel.date) == year)
        result = await self._session.execute(stmt.order_by(ChargeModel.date.desc()))
        charges = []
        for row in result.all():
            charge = _to_entity(row[0])
            charge.statement_type = row[1] or ""
            charge.uploaded_by = row[2]
            charges.append(charge)
        return charges

    async def bulk_create(self, statement_id: UUID, charges: list[ParsedCharge]) -> list[Charge]:
        models = [
            ChargeModel(
                statement_id=statement_id,
                date=c.date,
                description=c.description,
                amount=c.amount,
                currency=c.currency,
                cuota_numero=c.cuota_numero,
                cuota_total=c.cuota_total,
                cuota_monto=c.cuota_monto,
            )
            for c in charges
        ]
        self._session.add_all(models)
        await self._session.commit()
        for m in models:
            await self._session.refresh(m)
        return [_to_entity(m) for m in models]

    async def update_category(self, charge_id: UUID, category_id: UUID) -> Charge:
        result = await self._session.execute(select(ChargeModel).where(ChargeModel.id == charge_id))
        m = result.scalar_one()
        m.category_id = category_id
        await self._session.commit()
        await self._session.refresh(m)
        return _to_entity(m)

    async def bulk_update_categories(self, charges: list[Charge]) -> None:
        for charge in charges:
            if charge.category_id is not None:
                result = await self._session.execute(
                    select(ChargeModel).where(ChargeModel.id == charge.id)
                )
                m = result.scalar_one_or_none()
                if m:
                    m.category_id = charge.category_id
                    m.ai_suggested = charge.ai_suggested
        await self._session.commit()

    async def delete_by_statement(self, statement_id: UUID) -> int:
        from sqlalchemy import delete
        result = await self._session.execute(
            delete(ChargeModel).where(ChargeModel.statement_id == statement_id)
        )
        await self._session.commit()
        return result.rowcount  # type: ignore[attr-defined]

    async def delete(self, charge_id: UUID) -> None:
        from sqlalchemy import delete
        await self._session.execute(delete(ChargeModel).where(ChargeModel.id == charge_id))
        await self._session.commit()

    async def bulk_confirm(self, charge_ids: list[UUID]) -> int:
        result = await self._session.execute(
            select(ChargeModel).where(ChargeModel.id.in_(charge_ids))
        )
        models = result.scalars().all()
        for m in models:
            m.is_shared = True
        await self._session.commit()
        return len(models)

    async def bulk_unshare(self, charge_ids: list[UUID]) -> int:
        result = await self._session.execute(
            select(ChargeModel).where(ChargeModel.id.in_(charge_ids))
        )
        models = result.scalars().all()
        for m in models:
            m.is_shared = False
        await self._session.commit()
        return len(models)

    async def count_similar(self, uploaded_by: UUID, pattern: str, exclude_id: UUID, exclude_category_id: UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(ChargeModel)
            .join(StatementModel, ChargeModel.statement_id == StatementModel.id)
            .where(StatementModel.uploaded_by == uploaded_by)
            .where(ChargeModel.id != exclude_id)
            .where(func.lower(ChargeModel.description).contains(pattern.lower()))
            .where(or_(ChargeModel.category_id.is_(None), ChargeModel.category_id != exclude_category_id))
        )
        result = await self._session.execute(stmt)
        return result.scalar() or 0

    async def apply_category_by_pattern(self, uploaded_by: UUID, pattern: str, category_id: UUID, exclude_id: UUID) -> int:
        id_query = (
            select(ChargeModel.id)
            .join(StatementModel, ChargeModel.statement_id == StatementModel.id)
            .where(StatementModel.uploaded_by == uploaded_by)
            .where(ChargeModel.id != exclude_id)
            .where(func.lower(ChargeModel.description).contains(pattern.lower()))
        )
        id_result = await self._session.execute(id_query)
        ids = [row[0] for row in id_result.all()]
        if not ids:
            return 0
        await self._session.execute(update(ChargeModel).where(ChargeModel.id.in_(ids)).values(category_id=category_id))
        await self._session.commit()
        return len(ids)
