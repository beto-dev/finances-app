from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CreditCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)
    bank: str | None = Field(None, max_length=100)
    cuota_monto: int = Field(..., gt=0)
    cuota_numero: int = Field(..., ge=1)
    cuota_total: int = Field(..., ge=1)


class CreditUpdate(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)
    bank: str | None = Field(None, max_length=100)
    cuota_monto: int = Field(..., gt=0)
    cuota_numero: int = Field(..., ge=1)
    cuota_total: int = Field(..., ge=1)


class CreditResponse(BaseModel):
    id: UUID
    user_id: UUID
    description: str
    bank: str | None
    cuota_monto: int
    cuota_numero: int
    cuota_total: int
    created_at: datetime

    model_config = {"from_attributes": True}
