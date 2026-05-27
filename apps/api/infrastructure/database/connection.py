import os
import re
from collections.abc import AsyncIterator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://finances:finances@db:5432/finances")

# asyncpg does not support sslmode= in the URL — strip it and pass ssl via connect_args instead
_async_url = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
_needs_ssl = bool(re.search(r"sslmode=require", _async_url))
_async_url = re.sub(r"[?&]sslmode=\w+", "", _async_url)

_connect_args: dict = {"ssl": "require"} if _needs_ssl else {}
async_engine = create_async_engine(_async_url, echo=False, connect_args=_connect_args)
AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False, class_=AsyncSession)

# Sync engine for Alembic (psycopg2 supports sslmode natively)
sync_engine = create_engine(DATABASE_URL)
SyncSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session
