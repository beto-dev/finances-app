from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass
class Statement:
    id: UUID
    family_id: UUID | None
    uploaded_by: UUID
    filename: str
    type: str  # 'checking' | 'credit_card' | 'credit_line'
    status: str  # 'pending' | 'parsing' | 'parsed' | 'error'
    uploaded_at: datetime
    storage_path: str | None = None
    bank_hint: str | None = None
