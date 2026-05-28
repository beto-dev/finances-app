import json
import os
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import httpx
import structlog

from domain.entities.charge import ParsedCharge

log = structlog.get_logger()

_PAGE_CHUNK = 15
_MODEL = "deepseek/deepseek-v4-flash:free"
_API_URL = "https://openrouter.ai/api/v1/chat/completions"


class OpenRouterParser:
    """Uses OpenRouter free-tier models to extract transactions from bank statements.

    Free tier: 20 RPM, 200 RPD — no credit card required.
    Sign up at openrouter.ai to get a free API key.
    """

    def __init__(self) -> None:
        self._api_key = os.environ.get("OPENROUTER_API_KEY", "")

    @property
    def is_available(self) -> bool:
        return bool(self._api_key)

    async def parse_pdf_pages(self, pages: list[str], filename: str = "") -> list[ParsedCharge]:
        if not self._api_key or not any(p.strip() for p in pages):
            return []

        all_charges: list[ParsedCharge] = []
        for i in range(0, len(pages), _PAGE_CHUNK):
            chunk_text = "\n\n--- PAGE BREAK ---\n\n".join(pages[i : i + _PAGE_CHUNK])
            charges = await self._call(chunk_text, filename)
            all_charges.extend(charges)

        return all_charges

    async def parse_tabular(self, rows: list[list], filename: str = "") -> list[ParsedCharge]:
        if not self._api_key or not rows:
            return []

        text = "\n".join(
            " | ".join("" if cell is None else str(cell) for cell in row)
            for row in rows
        )
        return await self._call(text, filename)

    async def _call(self, content: str, filename: str) -> list[ParsedCharge]:
        prompt = f"""You are a bank statement parser. Extract every individual financial transaction from the text below.

Return ONLY a valid JSON array — no markdown, no explanation, nothing else. Each element:
{{"date": "YYYY-MM-DD", "description": "string", "amount": number}}

Rules:
- amount: positive = expense / debit / charge; negative = credit / refund / payment received
- Skip: column headers, balance rows, section titles, page numbers, summary totals
- Include: every individual transaction line
- date: always YYYY-MM-DD regardless of the original format
- amount: output as a plain integer with NO decimal point and NO dots. Latin American bank statements use . as the thousands separator, NOT as a decimal separator. So "$1.440" = 1440, "$28.260" = 28260, "$1.234.567" = 1234567. Strip every dot and output the resulting integer
- For installment purchases with multiple amounts, use the amount charged this billing period

Bank statement (file: {filename or "unknown"}):
{content}"""

        import asyncio

        last_exc: Exception | None = None
        for attempt in range(4):
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
                    return self._parse_response(text)
            except Exception as exc:
                last_exc = exc
                exc_str = str(exc)
                log.warning("openrouter_parser_attempt_failed", attempt=attempt + 1, error=exc_str[:200], filename=filename)
                if "429" in exc_str:
                    # RPM limit — wait for the 1-minute window to reset
                    log.warning("openrouter_ratelimit_wait", attempt=attempt + 1, filename=filename)
                    await asyncio.sleep(65)
                else:
                    break  # non-retriable error

        log.error("openrouter_parser_error", error=str(last_exc)[:200], filename=filename)
        raise RuntimeError(f"OpenRouter parsing failed: {last_exc}") from last_exc

    def _parse_response(self, text: str) -> list[ParsedCharge]:
        try:
            start = text.find("[")
            end = text.rfind("]") + 1
            if start == -1 or end == 0:
                log.warning("openrouter_parser_no_json_array", response_preview=text[:200])
                return []
            data = json.loads(text[start:end])
        except json.JSONDecodeError as exc:
            log.warning("openrouter_parser_invalid_json", error=str(exc), response_preview=text[:200])
            return []

        charges: list[ParsedCharge] = []
        for item in data:
            try:
                parsed_date = self._parse_date(str(item.get("date", "")))
                if parsed_date is None:
                    continue
                description = str(item.get("description", "")).strip()
                if not description:
                    continue
                amount = Decimal(str(item.get("amount", 0)))
                charges.append(ParsedCharge(date=parsed_date, description=description, amount=amount))
            except (InvalidOperation, TypeError, KeyError):
                continue

        return charges

    @staticmethod
    def _parse_date(date_str: str) -> date | None:
        for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%m/%d/%Y"]:
            try:
                return datetime.strptime(date_str.strip(), fmt).date()
            except ValueError:
                continue
        return None
