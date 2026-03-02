import os

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from presentation.api import auth, charges, debug, families, google, health, statements
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

frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
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
app.include_router(google.router)
if os.environ.get("ENABLE_DEBUG_ENDPOINTS") == "true":
    app.include_router(debug.router)


@app.on_event("startup")
async def startup_event() -> None:
    log.info("Finanzas API iniciada", version="0.1.0")
