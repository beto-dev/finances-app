from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass
class Family:
    id: UUID
    name: str
    owner_id: UUID
    created_at: datetime
    updated_at: datetime


@dataclass
class FamilyMember:
    id: UUID
    family_id: UUID
    user_id: UUID
    role: str  # 'owner' | 'member'
    is_active: bool
    joined_at: datetime
