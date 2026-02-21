from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from infrastructure.database.models import Base
import os

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://finances:finances@db:5432/finances")
ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False, class_=AsyncSession)

# Sync engine for Alembic
sync_engine = create_engine(DATABASE_URL)
SyncSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
