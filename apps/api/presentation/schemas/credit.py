from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class CreditCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)
    bank: str | None = Field(None, max_length=100)
    cuota_monto: int = Field(..., gt=0)
    cuota_numero: int = Field(..., ge=1)
    cuota_total: int = Field(..., ge=1)
    saldo_insoluto: Decimal | None = Field(None, ge=0)


class CreditUpdate(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)
    bank: str | None = Field(None, max_length=100)
    cuota_monto: int = Field(..., gt=0)
    cuota_numero: int = Field(..., ge=1)
    cuota_total: int = Field(..., ge=1)
    saldo_insoluto: Decimal | None = Field(None, ge=0)


class CreditResponse(BaseModel):
    id: UUID
    user_id: UUID
    description: str
    bank: str | None
    cuota_monto: int
    cuota_numero: int
    cuota_total: int
    saldo_insoluto: Decimal | None
    # Derived from saldo_insoluto + cuota_monto + remaining installments via the
    # amortization back-solve — null when saldo_insoluto hasn't been entered.
    monthly_interest: int | None
    monthly_capital: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
