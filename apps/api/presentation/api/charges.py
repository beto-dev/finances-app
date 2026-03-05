from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from application.use_cases.review_charges import ReviewChargesUseCase
from infrastructure.repositories.sql_category_repository import SQLCategoryRepository
from infrastructure.repositories.sql_charge_repository import SQLChargeRepository
from infrastructure.repositories.sql_user_repository import SQLUserRepository
from presentation.dependencies import CurrentUserId, DbSession, get_category_repo, get_charge_repo
from presentation.schemas.charge import (
    BulkConfirmRequest,
    ChargeResponse,
    ChargeUpdateCategory,
    ManualChargeRequest,
)

router = APIRouter(prefix="/api/charges", tags=["charges"])


@router.get("/", response_model=list[ChargeResponse])
async def list_charges(
    current_user_id: CurrentUserId,
    db: DbSession,
    month: int | None = Query(None),
    year: int | None = Query(None),
    charge_repo: SQLChargeRepository = Depends(get_charge_repo),
):
    user = await SQLUserRepository(db).get_by_id(current_user_id)
    personal = await charge_repo.get_personal(current_user_id, month, year)
    family_charges = (
        await charge_repo.get_by_family(user.family_id, month, year, uploaded_by_filter=current_user_id)
        if user and user.family_id
        else []
    )
    charges = personal + family_charges
    return [
        ChargeResponse(
            id=c.id, statement_id=c.statement_id, date=c.date, description=c.description,
            amount=c.amount, currency=c.currency, category_id=c.category_id,
            is_shared=c.is_shared, ai_suggested=c.ai_suggested, created_at=c.created_at,
            statement_type=c.statement_type, uploaded_by=c.uploaded_by,
        )
        for c in charges
    ]


@router.get("/family", response_model=list[ChargeResponse])
async def list_family_charges(
    current_user_id: CurrentUserId,
    db: DbSession,
    month: int | None = Query(None),
    year: int | None = Query(None),
    charge_repo: SQLChargeRepository = Depends(get_charge_repo),
):
    from infrastructure.repositories.sql_user_repository import SQLUserRepository
    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user or not user.family_id:
        return []
    charges = await charge_repo.get_confirmed_by_family(user.family_id, month, year)
    return [
        ChargeResponse(
            id=c.id, statement_id=c.statement_id, date=c.date, description=c.description,
            amount=c.amount, currency=c.currency, category_id=c.category_id,
            is_shared=c.is_shared, ai_suggested=c.ai_suggested, created_at=c.created_at,
            statement_type=c.statement_type, uploaded_by=c.uploaded_by,
        )
        for c in charges
    ]


@router.patch("/{charge_id}/category", response_model=ChargeResponse)
async def update_charge_category(
    charge_id: UUID,
    body: ChargeUpdateCategory,
    current_user_id: CurrentUserId,
    db: DbSession,
    charge_repo: SQLChargeRepository = Depends(get_charge_repo),
    category_repo: SQLCategoryRepository = Depends(get_category_repo),
):
    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user or not user.family_id:
        raise HTTPException(status_code=400, detail="Usuario sin familia")
    uc = ReviewChargesUseCase(charge_repo, category_repo)
    charge = await uc.update_category(charge_id, body.category_id, user.family_id)
    return ChargeResponse(
        id=charge.id, statement_id=charge.statement_id, date=charge.date,
        description=charge.description, amount=charge.amount, currency=charge.currency,
        category_id=charge.category_id, is_shared=charge.is_shared,
        ai_suggested=charge.ai_suggested, created_at=charge.created_at,
    )


@router.post("/bulk-confirm", response_model=dict)
async def bulk_confirm(
    body: BulkConfirmRequest,
    current_user_id: CurrentUserId,
    db: DbSession,
    charge_repo: SQLChargeRepository = Depends(get_charge_repo),
    category_repo: SQLCategoryRepository = Depends(get_category_repo),
):
    uc = ReviewChargesUseCase(charge_repo, category_repo)
    count = await uc.bulk_confirm(body.charge_ids)
    return {"confirmed": count}


@router.post("/bulk-unshare", response_model=dict)
async def bulk_unshare(
    body: BulkConfirmRequest,
    current_user_id: CurrentUserId,
    db: DbSession,
    charge_repo: SQLChargeRepository = Depends(get_charge_repo),
):
    count = await charge_repo.bulk_unshare(body.charge_ids)
    return {"unshared": count}


@router.post("/manual", response_model=ChargeResponse)
async def create_manual_charge(
    body: ManualChargeRequest,
    current_user_id: CurrentUserId,
    db: DbSession,
):
    import uuid as _uuid

    from sqlalchemy import select

    from infrastructure.database.models import ChargeModel as DBChargeModel
    from infrastructure.database.models import StatementModel

    result = await db.execute(
        select(StatementModel)
        .where(StatementModel.uploaded_by == current_user_id)
        .where(StatementModel.bank_hint == "manual")
        .where(StatementModel.family_id.is_(None))
    )
    statement = result.scalar_one_or_none()

    if not statement:
        statement = StatementModel(
            id=_uuid.uuid4(),
            family_id=None,
            uploaded_by=current_user_id,
            filename="Gastos Manuales",
            bank_hint="manual",
            type="checking",
            status="parsed",
        )
        db.add(statement)
        await db.flush()

    charge = DBChargeModel(
        id=_uuid.uuid4(),
        statement_id=statement.id,
        date=body.date,
        description=body.description,
        amount=body.amount,
        currency=body.currency,
        category_id=body.category_id,
        is_shared=False,
        ai_suggested=False,
    )
    db.add(charge)
    await db.commit()
    await db.refresh(charge)

    return ChargeResponse(
        id=charge.id,
        statement_id=charge.statement_id,
        date=charge.date,
        description=charge.description,
        amount=charge.amount,
        currency=charge.currency,
        category_id=charge.category_id,
        is_shared=charge.is_shared,
        ai_suggested=charge.ai_suggested,
        created_at=charge.created_at,
        statement_type="manual",
        uploaded_by=current_user_id,
    )


@router.get("/categories", response_model=list[dict])
async def list_categories(
    current_user_id: CurrentUserId,
    db: DbSession,
    category_repo: SQLCategoryRepository = Depends(get_category_repo),
):
    user = await SQLUserRepository(db).get_by_id(current_user_id)
    categories = await category_repo.get_all(user.family_id if user else None)
    return [{"id": str(c.id), "name": c.name, "color": c.color, "is_system": c.is_system} for c in categories]
