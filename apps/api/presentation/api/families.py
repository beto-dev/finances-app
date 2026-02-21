from typing import Annotated
from uuid import UUID
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from pydantic import BaseModel
from presentation.dependencies import CurrentUserId, DbSession, get_family_repo, get_user_repo
from infrastructure.repositories.sql_family_repository import SQLFamilyRepository
from infrastructure.repositories.sql_user_repository import SQLUserRepository
from infrastructure.database.models import FamilyContributionModel
from application.use_cases.manage_family import ManageFamilyUseCase
from presentation.schemas.family import FamilyCreate, FamilyResponse, FamilyMemberResponse, InviteMemberRequest


class ContributionItem(BaseModel):
    user_id: UUID
    percentage: Decimal


class ContributionsResponse(BaseModel):
    contributions: list[ContributionItem]
    total: Decimal

router = APIRouter(prefix="/api/families", tags=["families"])


@router.post("/", response_model=FamilyResponse, status_code=status.HTTP_201_CREATED)
async def create_family(
    body: FamilyCreate,
    current_user_id: CurrentUserId,
    db: DbSession,
    family_repo: SQLFamilyRepository = Depends(get_family_repo),
    user_repo: SQLUserRepository = Depends(get_user_repo),
):
    uc = ManageFamilyUseCase(family_repo, user_repo)
    family = await uc.create_family(body.name, current_user_id)
    return FamilyResponse(id=family.id, name=family.name, owner_id=family.owner_id, created_at=family.created_at)


@router.get("/me", response_model=FamilyResponse)
async def get_my_family(
    current_user_id: CurrentUserId,
    db: DbSession,
    family_repo: SQLFamilyRepository = Depends(get_family_repo),
    user_repo: SQLUserRepository = Depends(get_user_repo),
):
    user = await user_repo.get_by_id(current_user_id)
    if not user or not user.family_id:
        raise HTTPException(status_code=404, detail="No perteneces a ninguna familia")
    family = await family_repo.get_by_id(user.family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Familia no encontrada")
    return FamilyResponse(id=family.id, name=family.name, owner_id=family.owner_id, created_at=family.created_at)


@router.get("/me/members", response_model=list[FamilyMemberResponse])
async def get_family_members(
    current_user_id: CurrentUserId,
    db: DbSession,
    family_repo: SQLFamilyRepository = Depends(get_family_repo),
    user_repo: SQLUserRepository = Depends(get_user_repo),
):
    user = await user_repo.get_by_id(current_user_id)
    if not user or not user.family_id:
        return []
    members = await family_repo.get_members(user.family_id)
    result = []
    for m in members:
        member_user = await user_repo.get_by_id(m.user_id)
        result.append(FamilyMemberResponse(
            user_id=m.user_id,
            email=member_user.email if member_user else "",
            role=m.role,
            joined_at=m.joined_at,
        ))
    return result


@router.post("/me/invite", response_model=FamilyMemberResponse, status_code=status.HTTP_201_CREATED)
async def invite_member(
    body: InviteMemberRequest,
    current_user_id: CurrentUserId,
    db: DbSession,
    family_repo: SQLFamilyRepository = Depends(get_family_repo),
    user_repo: SQLUserRepository = Depends(get_user_repo),
):
    user = await user_repo.get_by_id(current_user_id)
    if not user or not user.family_id:
        raise HTTPException(status_code=400, detail="No perteneces a ninguna familia")
    uc = ManageFamilyUseCase(family_repo, user_repo)
    try:
        member = await uc.invite_member(user.family_id, body.email)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return FamilyMemberResponse(user_id=member.user_id, role=member.role, joined_at=member.joined_at)


@router.get("/me/contributions", response_model=ContributionsResponse)
async def get_contributions(
    current_user_id: CurrentUserId,
    db: DbSession,
    user_repo: SQLUserRepository = Depends(get_user_repo),
):
    user = await user_repo.get_by_id(current_user_id)
    if not user or not user.family_id:
        return ContributionsResponse(contributions=[], total=Decimal("0"))
    result = await db.execute(
        select(FamilyContributionModel).where(FamilyContributionModel.family_id == user.family_id)
    )
    rows = result.scalars().all()
    items = [ContributionItem(user_id=r.user_id, percentage=r.percentage) for r in rows]
    total = sum((i.percentage for i in items), Decimal("0"))
    return ContributionsResponse(contributions=items, total=total)


@router.put("/me/contributions", response_model=ContributionsResponse)
async def update_contributions(
    body: list[ContributionItem],
    current_user_id: CurrentUserId,
    db: DbSession,
    user_repo: SQLUserRepository = Depends(get_user_repo),
):
    user = await user_repo.get_by_id(current_user_id)
    if not user or not user.family_id:
        raise HTTPException(status_code=400, detail="No perteneces a ninguna familia")

    for item in body:
        result = await db.execute(
            select(FamilyContributionModel).where(
                FamilyContributionModel.family_id == user.family_id,
                FamilyContributionModel.user_id == item.user_id,
            )
        )
        row = result.scalar_one_or_none()
        if row:
            row.percentage = item.percentage
        else:
            db.add(FamilyContributionModel(
                family_id=user.family_id,
                user_id=item.user_id,
                percentage=item.percentage,
            ))
    await db.commit()

    result = await db.execute(
        select(FamilyContributionModel).where(FamilyContributionModel.family_id == user.family_id)
    )
    rows = result.scalars().all()
    items = [ContributionItem(user_id=r.user_id, percentage=r.percentage) for r in rows]
    total = sum((i.percentage for i in items), Decimal("0"))
    return ContributionsResponse(contributions=items, total=total)
