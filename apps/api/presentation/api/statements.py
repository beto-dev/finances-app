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
    from infrastructure.database.connection import AsyncSessionLocal
    from infrastructure.repositories.sql_category_repository import SQLCategoryRepository
    from presentation.dependencies import get_categorizer

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

        categorizer = get_categorizer()
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


@router.patch("/{statement_id}", response_model=StatementResponse)
async def update_statement(
    statement_id: UUID,
    current_user_id: CurrentUserId,
    db: DbSession,
    statement_type: str = Form(...),
    bank_hint: str | None = Form(default=None),
    statement_repo: SQLStatementRepository = Depends(get_statement_repo),
):
    from infrastructure.repositories.sql_user_repository import SQLUserRepository
    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user or not user.family_id:
        raise HTTPException(status_code=400, detail="El usuario no pertenece a ninguna familia")
    stmt = await statement_repo.get_by_id(statement_id)
    if not stmt or stmt.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Cartola no encontrada")
    updated = await statement_repo.update_type(statement_id, statement_type, bank_hint or None)
    return StatementResponse(
        id=updated.id, family_id=updated.family_id, filename=updated.filename,
        bank_hint=updated.bank_hint, type=updated.type, status=updated.status,
        uploaded_at=updated.uploaded_at,
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


@router.get("/summary")
async def statements_summary(
    current_user_id: CurrentUserId,
    db: DbSession,
):
    """Return all statements with charge counts and categorization status."""
    from sqlalchemy import func, select
    from infrastructure.database.models import ChargeModel, StatementModel
    from infrastructure.repositories.sql_user_repository import SQLUserRepository

    user = await SQLUserRepository(db).get_by_id(current_user_id)
    if not user or not user.family_id:
        return []

    total_sub = (
        select(ChargeModel.statement_id, func.count().label("total"))
        .group_by(ChargeModel.statement_id)
        .subquery()
    )
    categorized_sub = (
        select(ChargeModel.statement_id, func.count().label("categorized"))
        .where(ChargeModel.category_id.isnot(None))
        .group_by(ChargeModel.statement_id)
        .subquery()
    )

    result = await db.execute(
        select(
            StatementModel,
            func.coalesce(total_sub.c.total, 0).label("total"),
            func.coalesce(categorized_sub.c.categorized, 0).label("categorized"),
        )
        .outerjoin(total_sub, StatementModel.id == total_sub.c.statement_id)
        .outerjoin(categorized_sub, StatementModel.id == categorized_sub.c.statement_id)
        .where(StatementModel.family_id == user.family_id)
        .where(StatementModel.uploaded_by == current_user_id)
        .where(StatementModel.bank_hint != "manual")
        .order_by(StatementModel.uploaded_at.desc())
    )

    rows = result.all()
    return [
        {
            "id": str(row.StatementModel.id),
            "filename": row.StatementModel.filename,
            "type": row.StatementModel.type,
            "status": row.StatementModel.status,
            "uploaded_at": row.StatementModel.uploaded_at,
            "total_charges": row.total,
            "categorized": row.categorized,
            "uncategorized": row.total - row.categorized,
        }
        for row in rows
    ]


@router.post("/parse-preview")
async def parse_preview(
    current_user_id: CurrentUserId,
    file: UploadFile = File(...),
):
    """Diagnostic endpoint: extract text from a PDF without storing anything.

    Returns the extraction method used, a text preview, and the list of charges
    that would be created — useful for debugging parsers without touching the DB.
    """
    from infrastructure.parsers.pdf_parser import (
        _extract_pages_pdfplumber,
        _extract_pages_pdftotext,
        _extract_pages_pypdfium2,
        _looks_readable,
    )
    from application.services.parser_service import ParserService

    file_bytes = await file.read()
    filename = file.filename or ""

    # Run each extractor in order and report results
    extraction_log: list[dict] = []
    chosen_pages: list[str] = []
    chosen_method: str = "none"

    pages = _extract_pages_pdftotext(file_bytes)
    readable = pages and _looks_readable(pages)
    extraction_log.append({
        "method": "pdftotext",
        "pages": len(pages),
        "chars": sum(len(p) for p in pages),
        "readable": bool(readable),
        "preview": pages[0][:200] if pages else "",
    })
    if readable:
        chosen_pages = pages
        chosen_method = "pdftotext"
    else:
        try:
            pages = _extract_pages_pdfplumber(file_bytes, layout=True)
            readable = pages and _looks_readable(pages)
            extraction_log.append({
                "method": "pdfplumber_layout",
                "pages": len(pages),
                "chars": sum(len(p) for p in pages),
                "readable": bool(readable),
                "preview": pages[0][:200] if pages else "",
            })
        except Exception as exc:
            extraction_log.append({"method": "pdfplumber_layout", "error": str(exc)})
            pages = []
            readable = False
        if readable:
            chosen_pages = pages
            chosen_method = "pdfplumber_layout"
        else:
            try:
                pages = _extract_pages_pypdfium2(file_bytes)
                readable = pages and _looks_readable(pages)
                extraction_log.append({
                    "method": "pypdfium2",
                    "pages": len(pages),
                    "chars": sum(len(p) for p in pages),
                    "readable": bool(readable),
                    "preview": pages[0][:200] if pages else "",
                })
            except Exception as exc:
                extraction_log.append({"method": "pypdfium2", "error": str(exc)})
                pages = []
                readable = False
            if readable:
                chosen_pages = pages
                chosen_method = "pypdfium2"
            else:
                try:
                    pages = _extract_pages_pdfplumber(file_bytes, layout=False)
                    readable = pages and _looks_readable(pages)
                    extraction_log.append({
                        "method": "pdfplumber_default",
                        "pages": len(pages),
                        "chars": sum(len(p) for p in pages),
                        "readable": bool(readable),
                        "preview": pages[0][:200] if pages else "",
                    })
                except Exception as exc:
                    extraction_log.append({"method": "pdfplumber_default", "error": str(exc)})
                    pages = []
                    readable = False
                chosen_pages = pages if readable else []
                chosen_method = "pdfplumber_default" if readable else "none"

    # Use pdftotext first regardless of readable check (it uses layout spacing)
    pdftotext_pages = next((e["pages"] for e in extraction_log if e.get("method") == "pdftotext" and e.get("pages", 0) > 0), 0)
    if pdftotext_pages:
        chosen_pages = _extract_pages_pdftotext(file_bytes)
        chosen_method = "pdftotext (forced)"

    if not chosen_pages:
        return {"extraction_log": extraction_log, "chosen_method": "none", "charges": []}

    from infrastructure.ai.claude_parser import ClaudeParser, _PAGE_CHUNK

    claude = ClaudeParser()
    if not claude.is_available:
        return {"extraction_log": extraction_log, "chosen_method": chosen_method, "error": "Claude not available"}

    fallback_year = ClaudeParser._extract_year_from_filename(filename)
    all_charges = []
    chunk_log = []

    # Process in same page chunks as production parser to get accurate charge count
    for i in range(0, len(chosen_pages), _PAGE_CHUNK):
        chunk_pages = chosen_pages[i : i + _PAGE_CHUNK]
        chunk_text = "\n\n--- PAGE BREAK ---\n\n".join(chunk_pages)
        try:
            from anthropic.types import TextBlock as _TextBlock
            message = await claude._client.messages.create(  # type: ignore[union-attr]
                model="claude-haiku-4-5-20251001",
                max_tokens=8192,
                messages=[{"role": "user", "content": f"""You are a bank statement parser. Extract every individual financial transaction from the text below.

Return ONLY a valid JSON array — no markdown, no explanation, nothing else. Each element:
{{"date": "YYYY-MM-DD", "description": "string", "amount": number}}

Rules:
- date: always YYYY-MM-DD. Dates show as DD/MM without year — infer year from Período header (e.g. "Período: 01-Abr-2026 - 30-Abr-2026" → year 2026), filename, or any date with year in the text.
- amount: positive=expense/cargo, negative=income/abono. Chilean format: "$8.398"=8398, "$1.234.567"=1234567
- Skip: headers, balance rows, "Saldo", "Resumen", "Sin Movimientos"
- Include ALL transactions: cargos AND abonos

Bank statement (file: {filename}):
{chunk_text}"""}],
            )
            tb = next((b for b in message.content if isinstance(b, _TextBlock)), None)
            raw = tb.text if tb else ""
            stop_reason = message.stop_reason
        except Exception as exc:
            return {"extraction_log": extraction_log, "chosen_method": chosen_method, "claude_error": str(exc)}

        chunk_charges = claude._parse_response(raw, fallback_year=fallback_year)
        all_charges.extend(chunk_charges)
        chunk_log.append({
            "pages": f"{i+1}-{i+len(chunk_pages)}",
            "stop_reason": stop_reason,
            "charges": len(chunk_charges),
        })

    charges_out = [
        {"date": str(c.date), "description": c.description, "amount": str(c.amount)}
        for c in all_charges
    ]

    return {
        "extraction_log": extraction_log,
        "chosen_method": chosen_method,
        "total_pages": len(chosen_pages),
        "chunk_log": chunk_log,
        "total_charges": len(all_charges),
        "charges": charges_out,
    }


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
