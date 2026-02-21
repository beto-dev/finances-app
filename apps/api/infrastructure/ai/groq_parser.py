import asyncio
import json
import os
import structlog
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from domain.entities.charge import ParsedCharge

log = structlog.get_logger()

_PAGE_CHUNK = 15
_MODEL = "llama-3.3-70b-versatile"


class GroqParser:
    """Uses Groq (LLaMA 3.3 70B) to extract transactions from any bank statement format.

    Free tier: 14,400 requests/day, 30 RPM — no credit card required.
    Sign up at console.groq.com to get a free API key.
    Mirrors ClaudeParser's interface exactly.
    """

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
        return self._client is not None and bool(os.environ.get("GROQ_API_KEY", ""))

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
            charges = await self._call_groq(chunk_text, filename)
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
        return await self._call_groq(text, filename)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _call_groq(self, content: str, filename: str) -> list[ParsedCharge]:
        prompt = f"""You are a bank statement parser. Extract every individual financial transaction from the text below.

Return ONLY a valid JSON array — no markdown, no explanation, nothing else. Each element:
{{"date": "YYYY-MM-DD", "description": "string", "amount": number}}

Rules:
- amount: positive = expense / debit / charge; negative = credit / refund / payment received
- Skip: column headers, balance rows, section titles, page numbers, summary totals
- Include: every individual transaction line
- date: always YYYY-MM-DD regardless of the original format
- amount: output as a plain integer with NO decimal point and NO dots. Latin American bank statements use . as the thousands separator, NOT as a decimal separator. So "$1.440" = 1440, "$28.260" = 28260, "$1.234.567" = 1234567. Strip every dot and output the resulting integer (e.g. "1.440" → 1440, "28.260" → 28260)
- For installment purchases with multiple amounts, use the amount charged this billing period

Bank statement (file: {filename or "unknown"}):
{content}"""

        try:
            # groq SDK is synchronous; run in thread to avoid blocking FastAPI's event loop
            response = await asyncio.to_thread(
                self._client.chat.completions.create,
                model=_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=32768,
            )
            return self._parse_response(response.choices[0].message.content)
        except Exception as exc:
            log.warning(
                "groq_parser_error",
                error=str(exc),
                filename=filename,
                hint="Check GROQ_API_KEY at console.groq.com",
            )
            raise RuntimeError(
                f"Groq parsing failed: {exc}. "
                "Ensure GROQ_API_KEY is set (free at console.groq.com)."
            ) from exc

    def _parse_response(self, text: str) -> list[ParsedCharge]:
        """Parse Groq's JSON response into ParsedCharge objects."""
        try:
            start = text.find("[")
            end = text.rfind("]") + 1
            if start == -1 or end == 0:
                log.warning("groq_parser_no_json_array", response_preview=text[:200])
                return []
            data = json.loads(text[start:end])
        except json.JSONDecodeError as exc:
            log.warning("groq_parser_invalid_json", error=str(exc), response_preview=text[:200])
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
