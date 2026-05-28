import asyncio
import json
import os

import structlog

from domain.entities.category import Category
from domain.entities.charge import Charge

log = structlog.get_logger()

_MODEL = "gemini-2.0-flash"
_BATCH_SIZE = 50


class GeminiCategorizer:
    def __init__(self) -> None:
        self._client = None
        try:
            from google import genai
            api_key = os.environ.get("GEMINI_API_KEY", "")
            if api_key:
                self._client = genai.Client(api_key=api_key)
        except ImportError:
            pass

    @property
    def is_available(self) -> bool:
        return self._client is not None and bool(os.environ.get("GEMINI_API_KEY", ""))

    async def categorize_batch(self, charges: list[Charge], categories: list[Category]) -> list[Charge]:
        if self._client is None or not charges or not categories:
            return charges

        category_names = [f"{c.id}: {c.name}" for c in categories]
        results: list[Charge] = []

        for i in range(0, len(charges), _BATCH_SIZE):
            batch = charges[i : i + _BATCH_SIZE]
            batch_results = await self._categorize(batch, category_names, categories)
            results.extend(batch_results)

        return results

    async def _categorize(
        self, charges: list[Charge], category_names: list[str], categories: list[Category]
    ) -> list[Charge]:
        charge_list = "\n".join(
            f"{i}. [{c.date}] {c.description} — {c.amount} {c.currency}"
            for i, c in enumerate(charges)
        )

        prompt = f"""Eres un asistente de finanzas personales. Categoriza cada cargo en una de las categorias disponibles.

Categorias disponibles (formato: id: nombre):
{chr(10).join(category_names)}

Gastos a categorizar:
{charge_list}

Responde UNICAMENTE con un JSON array con el mismo numero de elementos que los gastos, en el mismo orden.
Cada elemento debe tener: {{"index": 0, "category_id": "uuid-de-la-categoria"}}.
Si no puedes determinar la categoria, usa la categoria "Otros"."""

        try:
            if self._client is None:
                raise RuntimeError("Gemini client not initialized")
            response = await asyncio.to_thread(
                self._client.models.generate_content,
                model=_MODEL,
                contents=prompt,
            )
            text = response.text or ""
            return self._parse_response(text, charges, categories)
        except Exception as exc:
            log.warning("gemini_categorizer_error", error=str(exc))
            return charges

    def _parse_response(
        self, text: str, charges: list[Charge], categories: list[Category]
    ) -> list[Charge]:
        try:
            start = text.find("[")
            end = text.rfind("]") + 1
            if start == -1 or end == 0:
                return charges
            data = json.loads(text[start:end])
            cat_by_id = {str(c.id): c for c in categories}
            for item in data:
                idx = item.get("index")
                cat_id = item.get("category_id")
                if isinstance(idx, int) and 0 <= idx < len(charges) and cat_id in cat_by_id:
                    charges[idx].category_id = cat_by_id[cat_id].id
                    charges[idx].ai_suggested = True
        except (json.JSONDecodeError, KeyError, IndexError, TypeError):
            pass
        return charges
