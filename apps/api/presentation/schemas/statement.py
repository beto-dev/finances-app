from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class StatementResponse(BaseModel):
    id: UUID
    family_id: UUID
    filename: str
    bank_hint: str | None
    type: str
    status: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class StatementCreate(BaseModel):
    type: str = "checking"
    bank_hint: str | None = None
