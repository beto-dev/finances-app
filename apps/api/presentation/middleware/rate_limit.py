from fastapi import Request
from fastapi.responses import Response
from slowapi import Limiter, _rate_limit_exceeded_handler as _slowapi_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


def on_rate_limit_exceeded(request: Request, exc: Exception) -> Response:
    if isinstance(exc, RateLimitExceeded):
        return _slowapi_handler(request, exc)
    return Response("Too Many Requests", status_code=429)


__all__ = ["limiter", "on_rate_limit_exceeded"]
