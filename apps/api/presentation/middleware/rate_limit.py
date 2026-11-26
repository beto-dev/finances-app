from fastapi import Request
from fastapi.responses import Response
from jwt import PyJWTError as JWTError
from slowapi import Limiter
from slowapi import _rate_limit_exceeded_handler as _slowapi_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from infrastructure.auth.supabase_middleware import _decode_legacy_jwt, _decode_supabase_jwt


def get_rate_limit_key(request: Request) -> str:
    """Key by authenticated user when possible, falling back to IP otherwise.

    Once Núcleo is the only caller (server-to-server), every request shares one
    container IP — keying by IP alone would collapse all users into a single shared
    limit. Decoding the bearer token here (instead of depending on get_current_user_id)
    keeps this synchronous and DB-free, since slowapi calls key_func before route
    dependencies resolve. Unauthenticated requests (e.g. the login endpoints
    themselves) fall back to per-IP limiting, which is what we want for them anyway.
    """
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:]
        try:
            payload = _decode_supabase_jwt(token)
        except JWTError:
            try:
                payload = _decode_legacy_jwt(token)
            except JWTError:
                payload = None
        if payload is not None:
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
    return get_remote_address(request)


limiter = Limiter(key_func=get_rate_limit_key)


def on_rate_limit_exceeded(request: Request, exc: Exception) -> Response:
    if isinstance(exc, RateLimitExceeded):
        return _slowapi_handler(request, exc)
    return Response("Too Many Requests", status_code=429)


__all__ = ["limiter", "on_rate_limit_exceeded"]
