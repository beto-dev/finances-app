import os

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from presentation.api import auth, charges, debug, families, google, health, statements

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
    allow_methods=["*"],
    allow_headers=["*"],
)

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
