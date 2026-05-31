from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from infrastructure.database.models import CategoryBudgetModel, CategoryModel, ChargeModel, StatementModel
from infrastructure.repositories.sql_user_repository import SQLUserRepository
from presentation.dependencies import CurrentUserId, DbSession

# Recommended % of net monthly income per expense category
_SUGGESTED_PCT: dict[str, float] = {
    "Alimentación": 0.12,
    "Hogar": 0.30,
    "Transporte": 0.08,
    "Salud": 0.06,
    "Farmacia": 0.03,
    "Servicios básicos": 0.06,
    "Ocio": 0.08,
    "Ropa": 0.04,
    "Educación": 0.04,
    "Suscripciones": 0.03,
    "Viajes": 0.03,
    "Ahorro / Inversión": 0.15,
    "Mascotas": 0.02,
    "Intereses e Impuestos": 0.03,
    "Otros": 0.05,
}

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


class BudgetUpsert(BaseModel):
    amount: Decimal


@router.get("/", response_model=dict)
async def list_budgets(current_user_id: CurrentUserId, db: DbSession):
    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user or not user.family_id:
        return {}
    result = await db.execute(
        select(CategoryBudgetModel).where(CategoryBudgetModel.family_id == user.family_id)
    )
    return {str(b.category_id): float(b.amount) for b in result.scalars().all()}


@router.put("/{category_id}", response_model=dict)
async def upsert_budget(
    category_id: UUID,
    body: BudgetUpsert,
    current_user_id: CurrentUserId,
    db: DbSession,
):
    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user or not user.family_id:
        raise HTTPException(status_code=400, detail="Usuario sin familia")
    result = await db.execute(
        select(CategoryBudgetModel).where(
            CategoryBudgetModel.family_id == user.family_id,
            CategoryBudgetModel.category_id == category_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.amount = body.amount
    else:
        db.add(CategoryBudgetModel(family_id=user.family_id, category_id=category_id, amount=body.amount))
    await db.commit()
    return {"category_id": str(category_id), "amount": float(body.amount)}


@router.get("/suggestions")
async def get_suggestions(current_user_id: CurrentUserId, db: DbSession):
    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user or not user.family_id:
        return {"income_avg": 0, "suggestions": {}}

    # Average income from last 3 months (negative charges = income)
    since = date.today() - timedelta(days=90)
    income_result = await db.execute(
        select(ChargeModel.amount)
        .join(StatementModel, ChargeModel.statement_id == StatementModel.id)
        .where(StatementModel.uploaded_by == current_user_id)
        .where(ChargeModel.amount < 0)
        .where(ChargeModel.date >= since)
    )
    income_amounts = [abs(float(r[0])) for r in income_result.all()]
    income_avg = round(sum(income_amounts) / 3) if income_amounts else 0

    if income_avg == 0:
        return {"income_avg": 0, "suggestions": {}}

    # Get all expense categories (system + family custom) with their names
    cats_result = await db.execute(
        select(CategoryModel).where(
            (CategoryModel.is_system == True) |  # noqa: E712
            (CategoryModel.family_id == user.family_id)
        )
    )
    categories = cats_result.scalars().all()

    suggestions: dict[str, float] = {}
    for cat in categories:
        pct = _SUGGESTED_PCT.get(cat.name)
        if pct:
            suggestions[str(cat.id)] = round(income_avg * pct / 1000) * 1000  # round to nearest 1000

    return {"income_avg": income_avg, "suggestions": suggestions}


@router.delete("/{category_id}", status_code=204)
async def delete_budget(category_id: UUID, current_user_id: CurrentUserId, db: DbSession):
    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user or not user.family_id:
        raise HTTPException(status_code=400, detail="Usuario sin familia")
    result = await db.execute(
        select(CategoryBudgetModel).where(
            CategoryBudgetModel.family_id == user.family_id,
            CategoryBudgetModel.category_id == category_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
