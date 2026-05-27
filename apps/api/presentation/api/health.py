from fastapi import APIRouter
from sqlalchemy import text

from infrastructure.database.connection import async_engine

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health_check():
    db_ok = False
    db_error = None
    try:
        async with async_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        db_error = str(e)[:200]

    return {
        "status": "ok" if db_ok else "degraded",
        "service": "finances-api",
        "db": "ok" if db_ok else "error",
        "db_error": db_error,
    }
