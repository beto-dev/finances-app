import os
import secrets
from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from presentation.dependencies import CurrentUserId, DbSession, get_sheets_client, get_google_oauth
from infrastructure.repositories.sql_user_repository import SQLUserRepository
from infrastructure.google.oauth_client import GoogleOAuthClient
from infrastructure.google.sheets_client import SheetsClient
from infrastructure.database.models import GoogleSheetConfigModel
from presentation.schemas.google import GoogleAuthStatusResponse, SyncResponse

router = APIRouter(prefix="/api/google", tags=["google"])

# In-memory state store (replace with Redis in production)
_oauth_states: dict[str, str] = {}


@router.get("/auth")
async def google_auth(
    current_user_id: CurrentUserId,
    oauth: GoogleOAuthClient = Depends(get_google_oauth),
):
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = str(current_user_id)
    url = oauth.get_authorization_url(state)
    return {"auth_url": url}


@router.get("/callback")
async def google_callback(
    db: DbSession,
    code: str = Query(...),
    state: str = Query(...),
    oauth: GoogleOAuthClient = Depends(get_google_oauth),
    sheets: SheetsClient = Depends(get_sheets_client),
):
    user_id_str = _oauth_states.pop(state, None)
    if not user_id_str:
        raise HTTPException(status_code=400, detail="Estado OAuth invalido")

    user_id = UUID(user_id_str)
    tokens = await oauth.exchange_code(code)
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")

    user = await SQLUserRepository(db).get_by_id(user_id)
    if not user or not user.family_id:
        raise HTTPException(status_code=400, detail="Usuario sin familia")

    # Create or get spreadsheet
    sheet_data = await sheets.create_spreadsheet("Finanzas — Familia", access_token)

    # Upsert config
    result = await db.execute(
        select(GoogleSheetConfigModel).where(GoogleSheetConfigModel.family_id == user.family_id)
    )
    config = result.scalar_one_or_none()
    if config:
        config.access_token = access_token
        config.refresh_token = refresh_token
        config.spreadsheet_id = sheet_data["spreadsheet_id"]
        config.spreadsheet_url = sheet_data["spreadsheet_url"]
    else:
        config = GoogleSheetConfigModel(
            family_id=user.family_id,
            spreadsheet_id=sheet_data["spreadsheet_id"],
            spreadsheet_url=sheet_data["spreadsheet_url"],
            access_token=access_token,
            refresh_token=refresh_token,
        )
        db.add(config)
    await db.commit()

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
    return RedirectResponse(url=f"{frontend_url}/hojas?connected=true")


@router.get("/status", response_model=GoogleAuthStatusResponse)
async def google_status(
    current_user_id: CurrentUserId,
    db: DbSession,
):
    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user or not user.family_id:
        return GoogleAuthStatusResponse(connected=False, spreadsheet_url=None, last_sync_at=None)

    result = await db.execute(
        select(GoogleSheetConfigModel).where(GoogleSheetConfigModel.family_id == user.family_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        return GoogleAuthStatusResponse(connected=False, spreadsheet_url=None, last_sync_at=None)

    return GoogleAuthStatusResponse(
        connected=True,
        spreadsheet_url=config.spreadsheet_url,
        last_sync_at=config.last_sync_at,
    )


@router.post("/sync", response_model=SyncResponse)
async def sync_to_sheets(
    current_user_id: CurrentUserId,
    db: DbSession,
    sheets: SheetsClient = Depends(get_sheets_client),
):
    from infrastructure.repositories.sql_charge_repository import SQLChargeRepository
    from infrastructure.repositories.sql_category_repository import SQLCategoryRepository
    from application.use_cases.sync_to_sheets import SyncToSheetsUseCase

    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user or not user.family_id:
        raise HTTPException(status_code=400, detail="Usuario sin familia")

    result = await db.execute(
        select(GoogleSheetConfigModel).where(GoogleSheetConfigModel.family_id == user.family_id)
    )
    config = result.scalar_one_or_none()
    if not config or not config.access_token:
        raise HTTPException(status_code=400, detail="Google Sheets no esta conectado")

    charge_repo = SQLChargeRepository(db)
    category_repo = SQLCategoryRepository(db)
    uc = SyncToSheetsUseCase(charge_repo, category_repo, sheets)
    sync_result = await uc.execute(user.family_id, config.spreadsheet_id, config.access_token)

    # Update last sync timestamp
    from datetime import datetime, timezone
    config.last_sync_at = datetime.now(timezone.utc)
    await db.commit()

    return SyncResponse(synced=sync_result["synced"], months=sync_result["months"])
