from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from infrastructure.database.models import CategoryBudgetModel
from infrastructure.repositories.sql_user_repository import SQLUserRepository
from presentation.dependencies import CurrentUserId, DbSession

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
