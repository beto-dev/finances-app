from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class FamilyCreate(BaseModel):
    name: str


class FamilyResponse(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class FamilyMemberResponse(BaseModel):
    user_id: UUID
    email: str
    role: str
    is_active: bool
    joined_at: datetime

    model_config = {"from_attributes": True}


class InviteMemberRequest(BaseModel):
    email: EmailStr
