import json
import os

import httpx
import structlog

from domain.entities.category import Category
from domain.entities.charge import Charge

log = structlog.get_logger()

_MODEL = "meta-llama/llama-3.1-8b-instruct:free"
_API_URL = "https://openrouter.ai/api/v1/chat/completions"
_BATCH_SIZE = 50


class OpenRouterCategorizer:
    def __init__(self) -> None:
        self._api_key = os.environ.get("OPENROUTER_API_KEY", "")

    @property
    def is_available(self) -> bool:
        return bool(self._api_key)

    async def categorize_batch(self, charges: list[Charge], categories: list[Category]) -> list[Charge]:
        if not self._api_key or not charges or not categories:
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
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    _API_URL,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "HTTP-Referer": "https://finances-app",
                        "X-Title": "Finances App",
                    },
                    json={
                        "model": _MODEL,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                response.raise_for_status()
                data = response.json()
                text = data["choices"][0]["message"]["content"] or ""
                return self._parse_response(text, charges, categories)
        except Exception as exc:
            log.warning("openrouter_categorizer_error", error=str(exc))
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
