from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID


@dataclass
class User:
    id: UUID
    email: str
    family_id: UUID | None
    created_at: datetime
    updated_at: datetime
    hashed_password: str | None = field(default=None, repr=False)
    full_name: str | None = None
    supabase_user_id: UUID | None = None
