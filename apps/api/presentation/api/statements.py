from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)

from application.services.parser_service import ParserService
from application.use_cases.parse_statement import ParseStatementUseCase
from application.use_cases.upload_statement import UploadStatementUseCase
from infrastructure.repositories.sql_charge_repository import SQLChargeRepository
from infrastructure.repositories.sql_statement_repository import SQLStatementRepository
from infrastructure.storage.supabase_storage import SupabaseStorage
from presentation.dependencies import CurrentUserId, DbSession, get_statement_repo, get_storage
from presentation.schemas.statement import StatementResponse

router = APIRouter(prefix="/api/statements", tags=["statements"])


async def _parse_statement_only(
    statement_id: UUID,
    file_bytes: bytes,
    filename: str,
) -> None:
    """Background task — Parse only, no AI categorization (skips if ANTHROPIC_API_KEY missing)."""
    from infrastructure.database.connection import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        statement_repo = SQLStatementRepository(session)
        charge_repo = SQLChargeRepository(session)
        parser_service = ParserService()

        parse_uc = ParseStatementUseCase(statement_repo, charge_repo, parser_service)
        await parse_uc.execute(statement_id, file_bytes, filename)


@router.post("/", response_model=StatementResponse, status_code=status.HTTP_201_CREATED)
async def upload_statement(
    background_tasks: BackgroundTasks,
    current_user_id: CurrentUserId,
    db: DbSession,
    file: UploadFile = File(...),
    statement_type: str = Form(default="checking"),
    bank_hint: str | None = Form(default=None),
    statement_repo: SQLStatementRepository = Depends(get_statement_repo),
    storage: SupabaseStorage = Depends(get_storage),
):
    from infrastructure.repositories.sql_user_repository import SQLUserRepository
    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user or not user.family_id:
        raise HTTPException(status_code=400, detail="El usuario no pertenece a ninguna familia")

    file_bytes = await file.read()
    upload_uc = UploadStatementUseCase(statement_repo, storage)
    statement = await upload_uc.execute(
        family_id=user.family_id,
        uploaded_by=current_user_id,
        filename=file.filename or "upload",
        file_bytes=file_bytes,
        content_type=file.content_type or "application/octet-stream",
        statement_type=statement_type,
        bank_hint=bank_hint,
    )

    background_tasks.add_task(
        _parse_statement_only,
        statement.id, file_bytes, file.filename or "upload",
    )

    return StatementResponse(
        id=statement.id,
        family_id=statement.family_id,
        filename=statement.filename,
        bank_hint=statement.bank_hint,
        type=statement.type,
        status=statement.status,
        uploaded_at=statement.uploaded_at,
    )


@router.get("/", response_model=list[StatementResponse])
async def list_statements(
    current_user_id: CurrentUserId,
    db: DbSession,
    statement_repo: SQLStatementRepository = Depends(get_statement_repo),
):
    from infrastructure.repositories.sql_user_repository import SQLUserRepository
    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user or not user.family_id:
        return []
    statements = await statement_repo.get_by_family(user.family_id, uploaded_by=current_user_id)
    return [
        StatementResponse(
            id=s.id, family_id=s.family_id, filename=s.filename,
            bank_hint=s.bank_hint, type=s.type, status=s.status, uploaded_at=s.uploaded_at,
        )
        for s in statements
    ]
