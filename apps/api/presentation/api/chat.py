import os

import anthropic
from fastapi import APIRouter, Request

from application.use_cases.chat_with_data import ChatWithDataUseCase
from infrastructure.repositories.sql_category_repository import SQLCategoryRepository
from infrastructure.repositories.sql_charge_repository import SQLChargeRepository
from infrastructure.repositories.sql_user_repository import SQLUserRepository
from presentation.dependencies import CurrentUserId, DbSession
from presentation.middleware.rate_limit import limiter
from presentation.schemas.chat import ChatMessageIn, ChatMessageOut

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/", response_model=ChatMessageOut)
@limiter.limit("30/hour")
async def chat(
    request: Request,
    body: ChatMessageIn,
    current_user_id: CurrentUserId,
    db: DbSession,
) -> ChatMessageOut:
    api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("APP_ANTHROPIC_API_KEY", "")
    use_case = ChatWithDataUseCase(
        charge_repo=SQLChargeRepository(db),
        category_repo=SQLCategoryRepository(db),
        user_repo=SQLUserRepository(db),
        anthropic_client=anthropic.AsyncAnthropic(api_key=api_key),
    )
    reply = await use_case.execute(body.message, body.history, current_user_id)
    return ChatMessageOut(reply=reply)
