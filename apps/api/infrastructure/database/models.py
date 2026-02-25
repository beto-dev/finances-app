import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Numeric, String, Text, Date, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class UserModel(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), nullable=False, unique=True)
    hashed_password = Column(String(255), nullable=True)
    family_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    statements = relationship("StatementModel", back_populates="uploader")
    family_memberships = relationship("FamilyMemberModel", back_populates="user")


class FamilyModel(Base):
    __tablename__ = "families"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    members = relationship("FamilyMemberModel", back_populates="family")
    statements = relationship("StatementModel", back_populates="family")
    sheet_config = relationship("GoogleSheetConfigModel", back_populates="family", uselist=False)


class FamilyMemberModel(Base):
    __tablename__ = "family_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    family_id = Column(UUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(50), nullable=False, default="member")
    is_active = Column(Boolean, nullable=False, default=True)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("family_id", "user_id", name="uq_family_member"),)

    family = relationship("FamilyModel", back_populates="members")
    user = relationship("UserModel", back_populates="family_memberships")


class FamilyContributionModel(Base):
    __tablename__ = "family_contributions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    family_id = Column(UUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    percentage = Column(Numeric(5, 2), nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("family_id", "user_id", name="uq_family_contribution"),)


class CategoryModel(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    family_id = Column(UUID(as_uuid=True), nullable=True)
    is_system = Column(Boolean, nullable=False, default=False)
    color = Column(String(7), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    charges = relationship("ChargeModel", back_populates="category")
    rules = relationship("CategoryRuleModel", back_populates="category")


class CategoryRuleModel(Base):
    __tablename__ = "category_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    family_id = Column(UUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    pattern = Column(String(255), nullable=False)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    category = relationship("CategoryModel", back_populates="rules")


class StatementModel(Base):
    __tablename__ = "statements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    family_id = Column(UUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    storage_path = Column(String(500), nullable=True)
    bank_hint = Column(String(100), nullable=True)
    type = Column(String(50), nullable=False, default="checking")
    status = Column(String(50), nullable=False, default="pending")
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    family = relationship("FamilyModel", back_populates="statements")
    uploader = relationship("UserModel", back_populates="statements")
    charges = relationship("ChargeModel", back_populates="statement")


class ChargeModel(Base):
    __tablename__ = "charges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    statement_id = Column(UUID(as_uuid=True), ForeignKey("statements.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    description = Column(Text, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="CLP")
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
    is_confirmed = Column(Boolean, nullable=False, default=False)
    ai_suggested = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    statement = relationship("StatementModel", back_populates="charges")
    category = relationship("CategoryModel", back_populates="charges")


class GoogleSheetConfigModel(Base):
    __tablename__ = "google_sheet_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    family_id = Column(UUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, unique=True)
    spreadsheet_id = Column(String(255), nullable=False)
    spreadsheet_url = Column(String(500), nullable=False)
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expiry = Column(DateTime(timezone=True), nullable=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    family = relationship("FamilyModel", back_populates="sheet_config")
