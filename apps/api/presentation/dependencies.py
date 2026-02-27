from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from application.services.categorization_service import CategorizationService
from application.services.parser_service import ParserService
from infrastructure.ai.claude_categorizer import ClaudeCategorizer
from infrastructure.auth.supabase_middleware import get_current_user_id
from infrastructure.database.connection import get_db
from infrastructure.google.oauth_client import GoogleOAuthClient
from infrastructure.google.sheets_client import SheetsClient
from infrastructure.repositories.sql_category_repository import SQLCategoryRepository
from infrastructure.repositories.sql_charge_repository import SQLChargeRepository
from infrastructure.repositories.sql_family_repository import SQLFamilyRepository
from infrastructure.repositories.sql_statement_repository import SQLStatementRepository
from infrastructure.repositories.sql_user_repository import SQLUserRepository
from infrastructure.storage.supabase_storage import SupabaseStorage

# Type aliases
DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUserId = Annotated[UUID, Depends(get_current_user_id)]


def get_user_repo(db: DbSession) -> SQLUserRepository:
    return SQLUserRepository(db)

def get_family_repo(db: DbSession) -> SQLFamilyRepository:
    return SQLFamilyRepository(db)

def get_statement_repo(db: DbSession) -> SQLStatementRepository:
    return SQLStatementRepository(db)

def get_charge_repo(db: DbSession) -> SQLChargeRepository:
    return SQLChargeRepository(db)

def get_category_repo(db: DbSession) -> SQLCategoryRepository:
    return SQLCategoryRepository(db)

def get_storage() -> SupabaseStorage:
    return SupabaseStorage()

def get_claude() -> ClaudeCategorizer:
    return ClaudeCategorizer()

def get_google_oauth() -> GoogleOAuthClient:
    return GoogleOAuthClient()

def get_sheets_client() -> SheetsClient:
    return SheetsClient()

def get_parser_service() -> ParserService:
    return ParserService()

def get_categorization_service(
    category_repo: Annotated[SQLCategoryRepository, Depends(get_category_repo)],
    claude: Annotated[ClaudeCategorizer, Depends(get_claude)],
) -> CategorizationService:
    return CategorizationService(category_repo, claude)
