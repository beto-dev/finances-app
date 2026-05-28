from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
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
from presentation.middleware.rate_limit import limiter
from presentation.schemas.statement import StatementResponse

_MAX_SIZE_MB = 10
_ALLOWED_MAGIC: list[tuple[bytes, str]] = [
    (b"%PDF", "application/pdf"),
    (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
]


def _validate_file(filename: str, file_bytes: bytes, content_type: str) -> None:
    if len(file_bytes) > _MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"El archivo supera {_MAX_SIZE_MB} MB")

    header = file_bytes[:8]
    ext = (filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""

    if ext == "csv" and content_type in ("text/csv", "text/plain", "application/octet-stream"):
        return  # CSV es texto plano, no tiene magic bytes

    for magic, _ in _ALLOWED_MAGIC:
        if header[: len(magic)] == magic:
            return

    raise HTTPException(status_code=400, detail="Tipo de archivo no permitido (PDF, XLSX o CSV)")

router = APIRouter(prefix="/api/statements", tags=["statements"])


async def _parse_and_categorize(
    statement_id: UUID,
    file_bytes: bytes,
    filename: str,
) -> None:
    """Background task — parse then auto-categorize with AI."""
    import structlog
    from application.services.categorization_service import CategorizationService
    from application.use_cases.categorize_charges import CategorizeChargesUseCase
    from infrastructure.ai.groq_categorizer import GroqCategorizer
    from infrastructure.ai.claude_categorizer import ClaudeCategorizer
    from infrastructure.database.connection import AsyncSessionLocal
    from infrastructure.repositories.sql_category_repository import SQLCategoryRepository

    log = structlog.get_logger()

    # Phase 1: Parse — isolated session so any post-parse error can't roll it back
    async with AsyncSessionLocal() as session:
        statement_repo = SQLStatementRepository(session)
        charge_repo = SQLChargeRepository(session)
        parser_service = ParserService()
        parse_uc = ParseStatementUseCase(statement_repo, charge_repo, parser_service)
        try:
            await parse_uc.execute(statement_id, file_bytes, filename)
        except Exception as exc:
            log.error("parse_failed", error=str(exc), error_type=type(exc).__name__, filename=filename, statement_id=str(statement_id))
            return  # status already set to 'error' by ParseStatementUseCase

    # Phase 2: Categorize — fresh session, parse result is already committed and safe
    async with AsyncSessionLocal() as session:
        statement_repo = SQLStatementRepository(session)
        charge_repo = SQLChargeRepository(session)
        stmt = await statement_repo.get_by_id(statement_id)
        if not stmt:
            return

        groq = GroqCategorizer()
        categorizer = groq if groq.is_available else ClaudeCategorizer()
        category_repo = SQLCategoryRepository(session)
        categorization_service = CategorizationService(category_repo, categorizer)
        categorize_uc = CategorizeChargesUseCase(charge_repo, category_repo, categorization_service)

        try:
            await categorize_uc.execute(statement_id, stmt.family_id)
        except Exception as exc:
            log.warning("auto_categorization_failed", error=str(exc), statement_id=str(statement_id))


@router.post("/", response_model=StatementResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/hour")
async def upload_statement(
    request: Request,
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
    _validate_file(file.filename or "", file_bytes, file.content_type or "")
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
        _parse_and_categorize,
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


@router.delete("/{statement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_statement(
    statement_id: UUID,
    current_user_id: CurrentUserId,
    db: DbSession,
    statement_repo: SQLStatementRepository = Depends(get_statement_repo),
):
    from infrastructure.repositories.sql_charge_repository import SQLChargeRepository
    from infrastructure.repositories.sql_user_repository import SQLUserRepository

    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user or not user.family_id:
        raise HTTPException(status_code=400, detail="El usuario no pertenece a ninguna familia")

    stmt = await statement_repo.get_by_id(statement_id)
    if not stmt or stmt.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Cartola no encontrada")

    await SQLChargeRepository(db).delete_by_statement(statement_id)
    await statement_repo.delete(statement_id)


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
