import os
from datetime import UTC, datetime
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt import PyJWTError as JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from infrastructure.database.connection import get_db
from infrastructure.repositories.sql_user_repository import SQLUserRepository

security = HTTPBearer()

JWT_SECRET = os.environ.get("JWT_SECRET", "change-this-secret")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")

# Cached JWKS client for verifying Supabase-issued (ES256) session tokens. Supabase's own
# edge caches rotate every ~10-20 min, so a matching lifespan avoids hammering the endpoint
# without risking a stale key past a real rotation.
_jwk_client: PyJWKClient | None = (
    PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=600)
    if SUPABASE_URL
    else None
)


def _decode_supabase_jwt(token: str) -> dict:
    if _jwk_client is None:
        raise JWTError("SUPABASE_URL not configured")
    signing_key = _jwk_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["ES256"],
        audience="authenticated",
        issuer=f"{SUPABASE_URL}/auth/v1",
    )


def _decode_legacy_jwt(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


async def _resolve_supabase_user(payload: dict, db: AsyncSession) -> UUID:
    """Map a verified Supabase JWT payload to finances-app's local users.id.

    Looks up by supabase_user_id first, falls back to linking an existing account by
    email (covers pre-existing local users not yet backfilled), and as a last resort
    just-in-time provisions a new local user — mirroring the existing Google-login flow.
    """
    supabase_uid_raw = payload.get("sub")
    if supabase_uid_raw is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido")
    supabase_uid = UUID(supabase_uid_raw)
    email = payload.get("email")

    repo = SQLUserRepository(db)

    user = await repo.get_by_supabase_user_id(supabase_uid)
    if user is not None:
        return user.id

    if email:
        user = await repo.get_by_email(email)
        if user is not None:
            user = await repo.link_supabase_user_id(user.id, supabase_uid)
            return user.id

    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token sin email")

    user_metadata = payload.get("user_metadata")
    full_name = None
    if isinstance(user_metadata, dict):
        full_name = user_metadata.get("full_name") or user_metadata.get("name")

    user = await repo.create_from_supabase(email=email, supabase_user_id=supabase_uid, full_name=full_name)
    return user.id


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: AsyncSession = Depends(get_db),
) -> UUID:
    token = credentials.credentials

    # Transition window: prefer Supabase-issued tokens, fall back to finances-app's own
    # legacy HS256 tokens so existing sessions on the standalone frontend keep working.
    # TODO(auth-unification): drop the legacy branch once /api/auth/* is retired.
    try:
        payload = _decode_supabase_jwt(token)
    except JWTError:
        try:
            legacy_payload = _decode_legacy_jwt(token)
        except JWTError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido o expirado")
        legacy_user_id = legacy_payload.get("sub")
        if legacy_user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido")
        return UUID(legacy_user_id)

    return await _resolve_supabase_user(payload, db)


def create_access_token(user_id: str) -> str:
    from datetime import timedelta
    payload = {
        "sub": user_id,
        "iat": datetime.now(UTC),
        "exp": datetime.now(UTC) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
