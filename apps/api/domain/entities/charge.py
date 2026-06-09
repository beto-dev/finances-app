from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID


@dataclass
class Charge:
    id: UUID
    statement_id: UUID
    date: date
    description: str
    amount: Decimal
    currency: str
    is_shared: bool
    ai_suggested: bool
    created_at: datetime
    category_id: UUID | None = None
    statement_type: str = ""
    uploaded_by: UUID | None = None
    bank_hint: str | None = None
    cuota_numero: int | None = None
    cuota_total: int | None = None
    cuota_monto: Decimal | None = None


@dataclass
class ParsedCharge:
    """Raw charge extracted from a bank statement file."""
    date: date
    description: str
    amount: Decimal
    currency: str = "CLP"
    cuota_numero: int | None = None
    cuota_total: int | None = None
    cuota_monto: Decimal | None = None
