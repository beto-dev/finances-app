import uuid
from datetime import date as date_type
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255))
    family_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    statements: Mapped[list["StatementModel"]] = relationship("StatementModel", back_populates="uploader")
    family_memberships: Mapped[list["FamilyMemberModel"]] = relationship(
        "FamilyMemberModel", back_populates="user"
    )


class FamilyModel(Base):
    __tablename__ = "families"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    members: Mapped[list["FamilyMemberModel"]] = relationship("FamilyMemberModel", back_populates="family")
    statements: Mapped[list["StatementModel"]] = relationship("StatementModel", back_populates="family")
    sheet_config: Mapped["GoogleSheetConfigModel | None"] = relationship(
        "GoogleSheetConfigModel", back_populates="family", uselist=False
    )


class FamilyMemberModel(Base):
    __tablename__ = "family_members"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    family_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="member")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("family_id", "user_id", name="uq_family_member"),)

    family: Mapped["FamilyModel"] = relationship("FamilyModel", back_populates="members")
    user: Mapped["UserModel"] = relationship("UserModel", back_populates="family_memberships")


class FamilyContributionModel(Base):
    __tablename__ = "family_contributions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    family_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (UniqueConstraint("family_id", "user_id", name="uq_family_contribution"),)


class CategoryModel(Base):
    __tablename__ = "categories"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    family_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    color: Mapped[str | None] = mapped_column(String(7))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    charges: Mapped[list["ChargeModel"]] = relationship("ChargeModel", back_populates="category")
    rules: Mapped[list["CategoryRuleModel"]] = relationship("CategoryRuleModel", back_populates="category")


class CategoryRuleModel(Base):
    __tablename__ = "category_rules"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    family_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=False
    )
    pattern: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    category: Mapped["CategoryModel"] = relationship("CategoryModel", back_populates="rules")


class StatementModel(Base):
    __tablename__ = "statements"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    family_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=False
    )
    uploaded_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str | None] = mapped_column(String(500))
    bank_hint: Mapped[str | None] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(50), nullable=False, default="checking")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    family: Mapped["FamilyModel"] = relationship("FamilyModel", back_populates="statements")
    uploader: Mapped["UserModel"] = relationship("UserModel", back_populates="statements")
    charges: Mapped[list["ChargeModel"]] = relationship("ChargeModel", back_populates="statement")


class ChargeModel(Base):
    __tablename__ = "charges"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    statement_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("statements.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CLP")
    category_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("categories.id"))
    is_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ai_suggested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    statement: Mapped["StatementModel"] = relationship("StatementModel", back_populates="charges")
    category: Mapped["CategoryModel | None"] = relationship("CategoryModel", back_populates="charges")


class GoogleSheetConfigModel(Base):
    __tablename__ = "google_sheet_configs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    family_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    spreadsheet_id: Mapped[str] = mapped_column(String(255), nullable=False)
    spreadsheet_url: Mapped[str] = mapped_column(String(500), nullable=False)
    access_token: Mapped[str | None] = mapped_column(Text)
    refresh_token: Mapped[str | None] = mapped_column(Text)
    token_expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    family: Mapped["FamilyModel"] = relationship("FamilyModel", back_populates="sheet_config")
