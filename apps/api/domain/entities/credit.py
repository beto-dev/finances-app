from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass
class Credit:
    id: UUID
    user_id: UUID
    description: str
    cuota_monto: int
    cuota_numero: int
    cuota_total: int
    created_at: datetime
    bank: str | None = None
