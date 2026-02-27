import asyncio
import json
import os
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import structlog

from domain.entities.charge import ParsedCharge

log = structlog.get_logger()

_PAGE_CHUNK = 15
_MODEL = "gemini-2.0-flash"


class GeminiParser:
    """Uses Google Gemini to extract transactions from any bank statement format.

    Free tier: 1,500 requests/day, 15 RPM — no credit card required.
    Mirrors ClaudeParser's interface exactly.
    """

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

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def parse_pdf_pages(self, pages: list[str], filename: str = "") -> list[ParsedCharge]:
        """Extract transactions from a list of PDF page texts."""
        if not self._client or not any(p.strip() for p in pages):
            return []

        all_charges: list[ParsedCharge] = []
        for i in range(0, len(pages), _PAGE_CHUNK):
            chunk_text = "\n\n--- PAGE BREAK ---\n\n".join(pages[i : i + _PAGE_CHUNK])
            charges = await self._call_gemini(chunk_text, filename)
            all_charges.extend(charges)

        return all_charges

    async def parse_tabular(self, rows: list[list], filename: str = "") -> list[ParsedCharge]:
        """Extract transactions from tabular data (CSV/Excel rows)."""
        if not self._client or not rows:
            return []

        text = "\n".join(
            " | ".join("" if cell is None else str(cell) for cell in row)
            for row in rows
        )
        return await self._call_gemini(text, filename)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _call_gemini(self, content: str, filename: str) -> list[ParsedCharge]:
        prompt = f"""You are a bank statement parser. Extract every individual financial transaction from the text below.

Return ONLY a valid JSON array — no markdown, no explanation, nothing else. Each element:
{{"date": "YYYY-MM-DD", "description": "string", "amount": number}}

Rules:
- amount: positive = expense / debit / charge; negative = credit / refund / payment received
- Skip: column headers, balance rows, section titles, page numbers, summary totals
- Include: every individual transaction line
- date: always YYYY-MM-DD regardless of the original format
- amount: plain integer or decimal, no currency symbols. IMPORTANT: many Latin American bank statements use . as the thousands separator and , as the decimal separator (e.g. "$1.440" = 1440, "$28.260" = 28260, "$1.234.567" = 1234567). Remove ALL thousands-separator dots and output the raw integer value
- For installment purchases with multiple amounts, use the amount charged this billing period

Bank statement (file: {filename or "unknown"}):
{content}"""

        try:
            response = await asyncio.to_thread(
                self._client.models.generate_content,
                model=_MODEL,
                contents=prompt,
            )
            return self._parse_response(response.text)
        except Exception as exc:
            log.warning(
                "gemini_parser_error",
                error=str(exc),
                filename=filename,
                hint="Check GEMINI_API_KEY at aistudio.google.com/app/apikey",
            )
            raise RuntimeError(
                f"Gemini parsing failed: {exc}. "
                "Ensure GEMINI_API_KEY is set (free at aistudio.google.com/app/apikey)."
            ) from exc

    def _parse_response(self, text: str) -> list[ParsedCharge]:
        """Parse Gemini's JSON response into ParsedCharge objects."""
        try:
            start = text.find("[")
            end = text.rfind("]") + 1
            if start == -1 or end == 0:
                log.warning("gemini_parser_no_json_array", response_preview=text[:200])
                return []
            data = json.loads(text[start:end])
        except json.JSONDecodeError as exc:
            log.warning("gemini_parser_invalid_json", error=str(exc), response_preview=text[:200])
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
