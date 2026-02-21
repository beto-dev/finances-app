from uuid import UUID
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from domain.entities.category import Category, CategoryRule
from domain.repositories.category_repository import CategoryRepository
from infrastructure.database.models import CategoryModel, CategoryRuleModel


def _to_cat(m: CategoryModel) -> Category:
    return Category(id=m.id, name=m.name, family_id=m.family_id, is_system=m.is_system, color=m.color, created_at=m.created_at)


def _to_rule(m: CategoryRuleModel) -> CategoryRule:
    return CategoryRule(id=m.id, family_id=m.family_id, pattern=m.pattern, category_id=m.category_id, created_at=m.created_at)


class SQLCategoryRepository(CategoryRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_all(self, family_id: UUID | None) -> list[Category]:
        cond = or_(CategoryModel.is_system == True)
        if family_id:
            cond = or_(CategoryModel.is_system == True, CategoryModel.family_id == family_id)
        result = await self._session.execute(select(CategoryModel).where(cond))
        return [_to_cat(m) for m in result.scalars().all()]

    async def get_by_id(self, category_id: UUID) -> Category | None:
        result = await self._session.execute(select(CategoryModel).where(CategoryModel.id == category_id))
        m = result.scalar_one_or_none()
        return _to_cat(m) if m else None

    async def create(self, name: str, family_id: UUID | None, color: str | None) -> Category:
        m = CategoryModel(name=name, family_id=family_id, color=color)
        self._session.add(m)
        await self._session.commit()
        await self._session.refresh(m)
        return _to_cat(m)

    async def get_rules(self, family_id: UUID) -> list[CategoryRule]:
        result = await self._session.execute(
            select(CategoryRuleModel).where(CategoryRuleModel.family_id == family_id)
        )
        return [_to_rule(m) for m in result.scalars().all()]

    async def create_rule(self, family_id: UUID, pattern: str, category_id: UUID) -> CategoryRule:
        m = CategoryRuleModel(family_id=family_id, pattern=pattern, category_id=category_id)
        self._session.add(m)
        await self._session.commit()
        await self._session.refresh(m)
        return _to_rule(m)

    async def find_matching_rule(self, family_id: UUID, description: str) -> CategoryRule | None:
        result = await self._session.execute(
            select(CategoryRuleModel).where(CategoryRuleModel.family_id == family_id)
        )
        rules = result.scalars().all()
        desc_lower = description.lower()
        for rule in rules:
            if rule.pattern.lower() in desc_lower:
                return _to_rule(rule)
        return None
