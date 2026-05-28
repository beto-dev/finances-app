import asyncio
import json
import os

import structlog

from domain.entities.category import Category
from domain.entities.charge import Charge

log = structlog.get_logger()

_MODEL = "llama-3.3-70b-versatile"
_BATCH_SIZE = 50


class GroqCategorizer:
    def __init__(self) -> None:
        self._client = None
        try:
            from groq import Groq
            api_key = os.environ.get("GROQ_API_KEY", "")
            if api_key:
                self._client = Groq(api_key=api_key)
        except ImportError:
            pass

    @property
    def is_available(self) -> bool:
        return self._client is not None

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

        from infrastructure.ai._groq_semaphore import get as groq_sem

        last_exc: Exception | None = None
        for attempt in range(4):
            try:
                if self._client is None:
                    raise RuntimeError("Groq client not initialized")
                if attempt > 0:
                    await asyncio.sleep(2 ** attempt)  # 2s, 4s, 8s
                async with groq_sem():
                    response = await asyncio.to_thread(
                        lambda: self._client.chat.completions.create(  # type: ignore[union-attr]
                            model=_MODEL,
                            messages=[{"role": "user", "content": prompt}],
                            max_tokens=4096,
                        )
                    )
                text = response.choices[0].message.content or ""
                return self._parse_response(text, charges, categories)
            except Exception as exc:
                last_exc = exc
                if "429" not in str(exc) and "rate" not in str(exc).lower():
                    break
                log.warning("groq_categorizer_rate_limit", attempt=attempt + 1)

        log.warning("groq_categorizer_error", error=str(last_exc))
        return charges  # return uncategorized rather than failing the whole statement

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
