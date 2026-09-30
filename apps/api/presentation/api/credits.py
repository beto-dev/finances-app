from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException

from application.services.amortization_service import monthly_breakdown
from infrastructure.repositories.sql_credit_repository import SQLCreditRepository
from presentation.dependencies import CurrentUserId, DbSession
from presentation.schemas.credit import CreditCreate, CreditResponse, CreditUpdate

router = APIRouter(prefix="/api/credits", tags=["credits"])


def _get_repo(db: DbSession) -> SQLCreditRepository:
    return SQLCreditRepository(db)


def _to_response(c: object) -> CreditResponse:
    from domain.entities.credit import Credit
    assert isinstance(c, Credit)

    monthly_interest: int | None = None
    monthly_capital: int | None = None
    remaining = c.cuota_total - c.cuota_numero
    if c.saldo_insoluto is not None and remaining > 0:
        breakdown = monthly_breakdown(c.saldo_insoluto, Decimal(c.cuota_monto), remaining)
        monthly_interest = int(breakdown["interest"])
        monthly_capital = int(breakdown["capital"])

    return CreditResponse(
        id=c.id,
        user_id=c.user_id,
        description=c.description,
        bank=c.bank,
        cuota_monto=c.cuota_monto,
        cuota_numero=c.cuota_numero,
        cuota_total=c.cuota_total,
        saldo_insoluto=c.saldo_insoluto,
        monthly_interest=monthly_interest,
        monthly_capital=monthly_capital,
        created_at=c.created_at,
    )


@router.get("/", response_model=list[CreditResponse])
async def list_credits(
    current_user_id: CurrentUserId,
    db: DbSession,
):
    repo = _get_repo(db)
    credits = await repo.get_by_user(current_user_id)
    return [_to_response(c) for c in credits]


@router.post("/", response_model=CreditResponse, status_code=201)
async def create_credit(
    body: CreditCreate,
    current_user_id: CurrentUserId,
    db: DbSession,
):
    if body.cuota_numero > body.cuota_total:
        raise HTTPException(status_code=400, detail="cuota_numero no puede ser mayor que cuota_total")
    repo = _get_repo(db)
    credit = await repo.create(
        user_id=current_user_id,
        description=body.description,
        bank=body.bank,
        cuota_monto=body.cuota_monto,
        cuota_numero=body.cuota_numero,
        cuota_total=body.cuota_total,
        saldo_insoluto=body.saldo_insoluto,
    )
    return _to_response(credit)


@router.patch("/{credit_id}", response_model=CreditResponse)
async def update_credit(
    credit_id: UUID,
    body: CreditUpdate,
    current_user_id: CurrentUserId,
    db: DbSession,
):
    repo = _get_repo(db)
    existing = await repo.get_by_id(credit_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Crédito no encontrado")
    if existing.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="No tienes permiso para editar este crédito")
    if body.cuota_numero > body.cuota_total:
        raise HTTPException(status_code=400, detail="cuota_numero no puede ser mayor que cuota_total")
    credit = await repo.update(
        credit_id=credit_id,
        description=body.description,
        bank=body.bank,
        cuota_monto=body.cuota_monto,
        cuota_numero=body.cuota_numero,
        cuota_total=body.cuota_total,
        saldo_insoluto=body.saldo_insoluto,
    )
    return _to_response(credit)


@router.delete("/{credit_id}", status_code=204)
async def delete_credit(
    credit_id: UUID,
    current_user_id: CurrentUserId,
    db: DbSession,
):
    repo = _get_repo(db)
    existing = await repo.get_by_id(credit_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Crédito no encontrado")
    if existing.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="No tienes permiso para eliminar este crédito")
    await repo.delete(credit_id)
