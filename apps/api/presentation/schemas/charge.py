from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel


class CategoryOut(BaseModel):
    id: UUID
    name: str
    color: str | None

    model_config = {"from_attributes": True}


class ChargeResponse(BaseModel):
    id: UUID
    statement_id: UUID
    date: date
    description: str
    amount: Decimal
    currency: str
    category_id: UUID | None
    is_confirmed: bool
    ai_suggested: bool
    created_at: datetime
    statement_type: str = ""
    uploaded_by: UUID | None = None

    model_config = {"from_attributes": True}


class ChargeUpdateCategory(BaseModel):
    category_id: UUID


class BulkConfirmRequest(BaseModel):
    charge_ids: list[UUID]


class ManualChargeRequest(BaseModel):
    amount: Decimal
    description: str
    category_id: UUID | None = None
    date: date
    currency: str = "CLP"
