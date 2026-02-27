import os
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

security = HTTPBearer()

JWT_SECRET = os.environ.get("JWT_SECRET", "change-this-secret")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")


def get_current_user_id(credentials: HTTPAuthorizationCredentials = Security(security)) -> UUID:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido")
        return UUID(user_id)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido o expirado")


def create_access_token(user_id: str) -> str:
    from datetime import timedelta
    payload = {
        "sub": user_id,
        "iat": datetime.now(UTC),
        "exp": datetime.now(UTC) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
