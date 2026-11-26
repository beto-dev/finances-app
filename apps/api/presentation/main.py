import os

import structlog
from fastapi import FastAPI
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from presentation.api import auth, budgets, charges, chat, credits, debug, families, health, statements
from presentation.middleware.rate_limit import limiter, on_rate_limit_exceeded
from presentation.middleware.security_headers import SecurityHeadersMiddleware

log = structlog.get_logger()

app = FastAPI(
    title="Finanzas API",
    description="API para el organizador de finanzas familiares Finanzas",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, on_rate_limit_exceeded)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(statements.router)
app.include_router(charges.router)
app.include_router(families.router)
app.include_router(credits.router)
app.include_router(budgets.router)
app.include_router(chat.router)
if os.environ.get("ENABLE_DEBUG_ENDPOINTS") == "true":
    app.include_router(debug.router)


@app.on_event("startup")
async def startup_event() -> None:
    log.info("Finanzas API iniciada", version="0.1.0")
