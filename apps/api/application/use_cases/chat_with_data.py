import json
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from domain.entities.category import Category
from domain.repositories.category_repository import CategoryRepository
from domain.repositories.charge_repository import ChargeRepository
from domain.repositories.user_repository import UserRepository

_MAX_CHARGES_LIMIT = 50
_MAX_MONTHS_BACK = 24

# System prompt is identical on every call (including every round of a single
# tool-calling loop) — cache it so repeat calls within the same conversation
# only pay full price once every 5 minutes instead of on every round.
_SYSTEM_PROMPT: list[dict[str, Any]] = [
    {
        "type": "text",
        "text": (
            "Eres un asistente financiero personal para la app Finanzas. "
            "Tienes acceso a los datos financieros reales del usuario a través de herramientas. "
            "Responde siempre en español, de forma concisa y útil. "
            "Usa las herramientas disponibles para obtener datos reales antes de responder. "
            "Los montos están en pesos chilenos (CLP). "
            "Montos positivos = gastos/débitos; negativos = ingresos/créditos."
        ),
        "cache_control": {"type": "ephemeral"},
    }
]

_TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_monthly_summary",
        "description": "Resumen financiero de un mes: total de gastos, ingresos, balance neto y top 5 categorías.",
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {"type": "integer", "description": "Mes (1-12)"},
                "year": {"type": "integer", "description": "Año (ej: 2026)"},
            },
            "required": ["month", "year"],
        },
    },
    {
        "name": "get_charges",
        "description": "Lista gastos con filtros opcionales. Devuelve fecha, descripción, monto y categoría.",
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {"type": "integer", "description": "Mes (1-12), opcional"},
                "year": {"type": "integer", "description": "Año, opcional"},
                "category_name": {
                    "type": "string",
                    "description": "Filtrar por nombre de categoría (parcial), opcional",
                },
                "limit": {"type": "integer", "description": "Máximo de resultados (default 20)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_category_breakdown",
        "description": "Desglose de gastos e ingresos por categoría para un período.",
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {"type": "integer", "description": "Mes (1-12), opcional"},
                "year": {"type": "integer", "description": "Año, opcional"},
            },
            "required": [],
        },
    },
    {
        "name": "get_trend",
        "description": "Tendencia mensual de gastos e ingresos de los últimos N meses.",
        "input_schema": {
            "type": "object",
            "properties": {
                "months_back": {"type": "integer", "description": "Cuántos meses hacia atrás (default 6)"},
            },
            "required": [],
        },
        # Tools are also identical on every call — same cache breakpoint rationale as the system prompt.
        "cache_control": {"type": "ephemeral"},
    },
]


class ChatWithDataUseCase:
    def __init__(
        self,
        charge_repo: ChargeRepository,
        category_repo: CategoryRepository,
        user_repo: UserRepository,
        anthropic_client: Any,
    ) -> None:
        self._charges = charge_repo
        self._categories = category_repo
        self._users = user_repo
        self._client = anthropic_client

    async def execute(self, message: str, history: list[dict[str, str]], user_id: UUID) -> str:
        user = await self._users.get_by_id(user_id)
        if user is None:
            return "No se pudo obtener la información del usuario."

        family_id = user.family_id
        categories = await self._categories.get_all(family_id)
        cat_by_id: dict[UUID, str] = {c.id: c.name for c in categories}

        messages: list[Any] = [
            *[{"role": m["role"], "content": m["content"]} for m in history],
            {"role": "user", "content": message},
        ]

        for _ in range(5):  # cap tool-calling rounds to prevent infinite loops
            response = await self._client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                system=_SYSTEM_PROMPT,
                tools=_TOOLS,
                messages=messages,
            )

            if response.stop_reason == "tool_use":
                tool_results: list[dict[str, Any]] = []
                for block in response.content:
                    if block.type == "tool_use":
                        raw = block.input if isinstance(block.input, dict) else {}
                        result = await self._execute_tool(
                            block.name, raw, user_id, family_id, cat_by_id, categories
                        )
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result, ensure_ascii=False, default=str),
                        })
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})
            else:
                for block in response.content:
                    if block.type == "text":
                        return block.text
                break

        return "No se pudo generar una respuesta."

    async def _execute_tool(
        self,
        name: str,
        inputs: dict[str, Any],
        user_id: UUID,
        family_id: UUID | None,
        cat_by_id: dict[UUID, str],
        categories: list[Category],
    ) -> Any:
        if name == "get_monthly_summary":
            return await self._monthly_summary(inputs, user_id, cat_by_id)
        if name == "get_charges":
            return await self._get_charges(inputs, user_id, cat_by_id, categories)
        if name == "get_category_breakdown":
            return await self._category_breakdown(inputs, user_id, cat_by_id)
        if name == "get_trend":
            return await self._trend(inputs, user_id)
        return {"error": f"Herramienta desconocida: {name}"}

    async def _monthly_summary(
        self, inputs: dict[str, Any], user_id: UUID, cat_by_id: dict[UUID, str]
    ) -> dict[str, Any]:
        month: int = int(inputs["month"])
        year: int = int(inputs["year"])
        charges = await self._charges.get_personal(user_id, month, year)

        expenses = sum((c.amount for c in charges if c.amount > 0), Decimal(0))
        income = sum((-c.amount for c in charges if c.amount < 0), Decimal(0))

        cat_totals: dict[str, Decimal] = defaultdict(Decimal)
        for c in charges:
            if c.amount > 0 and c.category_id:
                cat_totals[cat_by_id.get(c.category_id, "Sin categoría")] += c.amount

        top_cats = sorted(cat_totals.items(), key=lambda x: x[1], reverse=True)[:5]

        return {
            "month": month,
            "year": year,
            "total_expenses": float(expenses),
            "total_income": float(income),
            "balance": float(income - expenses),
            "charge_count": len(charges),
            "top_categories": [{"name": n, "amount": float(a)} for n, a in top_cats],
        }

    async def _get_charges(
        self,
        inputs: dict[str, Any],
        user_id: UUID,
        cat_by_id: dict[UUID, str],
        categories: list[Category],
    ) -> list[dict[str, Any]]:
        month: int | None = int(inputs["month"]) if "month" in inputs else None
        year: int | None = int(inputs["year"]) if "year" in inputs else None
        category_filter: str | None = str(inputs["category_name"]).lower() if "category_name" in inputs else None
        limit: int = min(int(inputs.get("limit", 20)), _MAX_CHARGES_LIMIT)

        charges = await self._charges.get_personal(user_id, month, year)

        if category_filter:
            matching_ids = {c.id for c in categories if category_filter in c.name.lower()}
            charges = [c for c in charges if c.category_id in matching_ids]

        charges = sorted(charges, key=lambda c: abs(c.amount), reverse=True)[:limit]

        return [
            {
                "date": str(c.date),
                "description": c.description,
                "amount": float(c.amount),
                "category": cat_by_id.get(c.category_id, "Sin categoría") if c.category_id else "Sin categoría",
            }
            for c in charges
        ]

    async def _category_breakdown(
        self, inputs: dict[str, Any], user_id: UUID, cat_by_id: dict[UUID, str]
    ) -> list[dict[str, Any]]:
        month: int | None = int(inputs["month"]) if "month" in inputs else None
        year: int | None = int(inputs["year"]) if "year" in inputs else None
        charges = await self._charges.get_personal(user_id, month, year)

        expense_by_cat: dict[str, Decimal] = defaultdict(Decimal)
        income_by_cat: dict[str, Decimal] = defaultdict(Decimal)

        for c in charges:
            name = cat_by_id.get(c.category_id, "Sin categoría") if c.category_id else "Sin categoría"
            if c.amount > 0:
                expense_by_cat[name] += c.amount
            else:
                income_by_cat[name] += -c.amount

        all_cats = set(expense_by_cat) | set(income_by_cat)
        results = [
            {
                "category": cat,
                "expenses": float(expense_by_cat.get(cat, Decimal(0))),
                "income": float(income_by_cat.get(cat, Decimal(0))),
            }
            for cat in all_cats
        ]
        return sorted(results, key=lambda x: x["expenses"], reverse=True)

    async def _trend(self, inputs: dict[str, Any], user_id: UUID) -> list[dict[str, Any]]:
        months_back: int = min(int(inputs.get("months_back", 6)), _MAX_MONTHS_BACK)
        all_charges = await self._charges.get_personal(user_id, None, None)

        today = date.today()
        target_months: set[tuple[int, int]] = set()
        for i in range(months_back):
            m = today.month - i
            y = today.year
            while m <= 0:
                m += 12
                y -= 1
            target_months.add((y, m))

        month_expenses: dict[tuple[int, int], Decimal] = defaultdict(Decimal)
        month_income: dict[tuple[int, int], Decimal] = defaultdict(Decimal)

        for c in all_charges:
            key = (c.date.year, c.date.month)
            if key in target_months:
                if c.amount > 0:
                    month_expenses[key] += c.amount
                else:
                    month_income[key] += -c.amount

        return [
            {
                "year": y,
                "month": m,
                "expenses": float(month_expenses.get((y, m), Decimal(0))),
                "income": float(month_income.get((y, m), Decimal(0))),
            }
            for y, m in sorted(target_months)
        ]
