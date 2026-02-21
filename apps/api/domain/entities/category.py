from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass
class Category:
    id: UUID
    name: str
    is_system: bool
    created_at: datetime
    family_id: UUID | None = None
    color: str | None = None


@dataclass
class CategoryRule:
    id: UUID
    family_id: UUID
    pattern: str
    category_id: UUID
    created_at: datetime
