from typing import Annotated
from uuid import UUID
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete as sql_delete
from pydantic import BaseModel
from presentation.dependencies import CurrentUserId, DbSession, get_family_repo, get_user_repo
from infrastructure.repositories.sql_family_repository import SQLFamilyRepository
from infrastructure.repositories.sql_user_repository import SQLUserRepository
from infrastructure.database.models import FamilyContributionModel, StatementModel, UserModel
from application.use_cases.manage_family import ManageFamilyUseCase
from presentation.schemas.family import FamilyCreate, FamilyResponse, FamilyMemberResponse, InviteMemberRequest


class ContributionItem(BaseModel):
    user_id: UUID
    percentage: Decimal


class ContributionsResponse(BaseModel):
    contributions: list[ContributionItem]
    total: Decimal

router = APIRouter(prefix="/api/families", tags=["families"])


async def _assert_admin(current_user_id: UUID, user_repo: SQLUserRepository, family_repo: SQLFamilyRepository):
    """Ensure the current user is an admin of their family. Returns (user, family)."""
    user = await user_repo.get_by_id(current_user_id)
    if not user or not user.family_id:
        raise HTTPException(status_code=400, detail="No perteneces a ninguna familia")
    family = await family_repo.get_by_id(user.family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Familia no encontrada")
    me = await family_repo.get_member(family.id, current_user_id)
    if not me or me.role != "admin":
        raise HTTPException(status_code=403, detail="Solo los administradores pueden gestionar miembros")
    return user, family


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


@router.get("/me/role")
async def get_my_role(
    current_user_id: CurrentUserId,
    db: DbSession,
    family_repo: SQLFamilyRepository = Depends(get_family_repo),
    user_repo: SQLUserRepository = Depends(get_user_repo),
):
    user = await user_repo.get_by_id(current_user_id)
    if not user or not user.family_id:
        return {"role": None}
    me = await family_repo.get_member(user.family_id, current_user_id)
    return {"role": me.role if me else None}


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
            is_active=m.is_active,
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
    current_user, family = await _assert_admin(current_user_id, user_repo, family_repo)
    uc = ManageFamilyUseCase(family_repo, user_repo)
    try:
        member = await uc.invite_member(family.id, body.email)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return FamilyMemberResponse(user_id=member.user_id, email="", role=member.role, is_active=member.is_active, joined_at=member.joined_at)


@router.patch("/me/members/{user_id}/active", response_model=FamilyMemberResponse)
async def toggle_member_active(
    user_id: UUID,
    body: dict,
    current_user_id: CurrentUserId,
    db: DbSession,
    family_repo: SQLFamilyRepository = Depends(get_family_repo),
    user_repo: SQLUserRepository = Depends(get_user_repo),
):
    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="No puedes modificar tu propio estado")
    current_user, family = await _assert_admin(current_user_id, user_repo, family_repo)
    is_active = body.get("is_active")
    if not isinstance(is_active, bool):
        raise HTTPException(status_code=422, detail="is_active debe ser true o false")
    member = await family_repo.set_member_active(family.id, user_id, is_active)
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    target_user = await user_repo.get_by_id(user_id)
    return FamilyMemberResponse(
        user_id=member.user_id,
        email=target_user.email if target_user else "",
        role=member.role,
        is_active=member.is_active,
        joined_at=member.joined_at,
    )


@router.patch("/me/members/{user_id}/role", response_model=FamilyMemberResponse)
async def set_member_role(
    user_id: UUID,
    body: dict,
    current_user_id: CurrentUserId,
    db: DbSession,
    family_repo: SQLFamilyRepository = Depends(get_family_repo),
    user_repo: SQLUserRepository = Depends(get_user_repo),
):
    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="No puedes cambiar tu propio rol")
    current_user, family = await _assert_admin(current_user_id, user_repo, family_repo)
    role = body.get("role")
    if role not in ("admin", "member"):
        raise HTTPException(status_code=422, detail="rol debe ser 'admin' o 'member'")
    if role == "member":
        members = await family_repo.get_members(family.id)
        admin_count = sum(1 for m in members if m.role == "admin" and m.user_id != user_id)
        if admin_count == 0:
            raise HTTPException(status_code=400, detail="Debe haber al menos un administrador en la familia")
    member = await family_repo.set_member_role(family.id, user_id, role)
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    target_user = await user_repo.get_by_id(user_id)
    return FamilyMemberResponse(
        user_id=member.user_id,
        email=target_user.email if target_user else "",
        role=member.role,
        is_active=member.is_active,
        joined_at=member.joined_at,
    )


@router.delete("/me/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    user_id: UUID,
    current_user_id: CurrentUserId,
    db: DbSession,
    family_repo: SQLFamilyRepository = Depends(get_family_repo),
    user_repo: SQLUserRepository = Depends(get_user_repo),
):
    """Hard delete: removes all user statements (charges cascade) then the user record."""
    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    current_user, family = await _assert_admin(current_user_id, user_repo, family_repo)
    await db.execute(
        sql_delete(StatementModel).where(
            StatementModel.uploaded_by == user_id,
            StatementModel.family_id == family.id,
        )
    )
    result = await db.execute(select(UserModel).where(UserModel.id == user_id))
    target = result.scalar_one_or_none()
    if target:
        await db.delete(target)
    await db.commit()


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
