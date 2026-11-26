from fastapi import APIRouter, HTTPException

from infrastructure.repositories.sql_user_repository import SQLUserRepository
from presentation.dependencies import CurrentUserId, DbSession

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me")
async def get_me(current_user_id: CurrentUserId, db: DbSession):
    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"id": str(user.id), "email": user.email, "full_name": user.full_name}
