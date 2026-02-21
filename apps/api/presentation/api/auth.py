import os
import secrets
import bcrypt
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from urllib.parse import urlencode
from presentation.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from presentation.dependencies import get_user_repo, DbSession
from infrastructure.repositories.sql_user_repository import SQLUserRepository
from infrastructure.auth.supabase_middleware import create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

# In-memory CSRF state store (replace with Redis in production)
_login_states: dict[str, str] = {}


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    user_repo: Annotated[SQLUserRepository, Depends(get_user_repo)],
):
    existing = await user_repo.get_by_email(body.email)
    if existing:
        raise HTTPException(status_code=400, detail="El correo ya esta registrado")
    hashed = _hash(body.password)
    user = await user_repo.create(body.email, hashed, None)
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    user_repo: Annotated[SQLUserRepository, Depends(get_user_repo)],
):
    user = await user_repo.get_by_email(body.email)
    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Credenciales invalidas")
    if not _verify(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales invalidas")
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.get("/google")
async def google_login():
    state = secrets.token_urlsafe(32)
    _login_states[state] = "pending"
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    redirect_uri = os.environ.get("GOOGLE_LOGIN_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
        "state": state,
    }
    return RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


@router.get("/google/callback")
async def google_callback(
    db: DbSession,
    code: str = Query(...),
    state: str = Query(...),
):
    import httpx

    if state not in _login_states:
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
        return RedirectResponse(url=f"{frontend_url}/login?error=invalid_state")
    _login_states.pop(state)

    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = os.environ.get("GOOGLE_LOGIN_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()

        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        userinfo_resp.raise_for_status()
        userinfo = userinfo_resp.json()

    email: str = userinfo.get("email", "").lower().strip()

    # Check allowlist
    allowed_raw = os.environ.get("ALLOWED_EMAILS", "")
    allowed = {e.strip().lower() for e in allowed_raw.split(",") if e.strip()}
    if allowed and email not in allowed:
        return RedirectResponse(url=f"{frontend_url}/login?error=not_allowed")

    # Find or create user
    user_repo = SQLUserRepository(db)
    user = await user_repo.get_by_email(email)
    if not user:
        user = await user_repo.create(email, None, None)

    token = create_access_token(str(user.id))
    return RedirectResponse(
        url=f"{frontend_url}/auth/callback?token={token}&email={email}&id={user.id}"
    )
