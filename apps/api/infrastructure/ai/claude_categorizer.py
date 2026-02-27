import json
import os

from domain.entities.category import Category
from domain.entities.charge import Charge


class ClaudeCategorizer:
    BATCH_SIZE = 50

    def __init__(self) -> None:
        try:
            import anthropic
            self._client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        except ImportError:
            self._client = None

    async def categorize_batch(self, charges: list[Charge], categories: list[Category]) -> list[Charge]:
        if self._client is None:
            return charges

        category_names = [f"{c.id}: {c.name}" for c in categories]
        results: list[Charge] = []

        for i in range(0, len(charges), self.BATCH_SIZE):
            batch = charges[i: i + self.BATCH_SIZE]
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

        message = await self._client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )

        try:
            text = message.content[0].text
            start = text.find("[")
            end = text.rfind("]") + 1
            data = json.loads(text[start:end])

            cat_by_id = {str(c.id): c for c in categories}
            for item in data:
                idx = item["index"]
                cat_id = item.get("category_id")
                if 0 <= idx < len(charges) and cat_id in cat_by_id:
                    charges[idx].category_id = cat_by_id[cat_id].id
                    charges[idx].ai_suggested = True
        except (json.JSONDecodeError, KeyError, IndexError):
            pass

        return charges
