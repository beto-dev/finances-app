import json
import os
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import structlog

from domain.entities.charge import ParsedCharge

log = structlog.get_logger()

# Max pages per Claude call. Haiku caps output at 8192 tokens; a dense cartola
# can produce ~50 transactions per page × 40 tokens each, so 3 pages ≈ 6000 tokens
# of output — safely within the limit. 15 pages was too many for long statements.
_PAGE_CHUNK = 3


class ClaudeParser:
    """Uses Claude to extract transactions from any bank statement format.

    Works for PDF (text), CSV, and Excel regardless of bank or layout.
    No templates or examples needed — Claude understands the format on the fly.
    """

    def __init__(self) -> None:
        self._client: Any = None
        try:
            import anthropic
            api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("APP_ANTHROPIC_API_KEY", "")
            self._client = anthropic.AsyncAnthropic(api_key=api_key)
        except ImportError:
            pass

    @property
    def is_available(self) -> bool:
        key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("APP_ANTHROPIC_API_KEY", "")
        return self._client is not None and bool(key)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def parse_pdf_pages(self, pages: list[str], filename: str = "") -> list[ParsedCharge]:
        """Extract transactions from a list of PDF page texts."""
        if not self._client or not any(p.strip() for p in pages):
            return []

        all_charges: list[ParsedCharge] = []
        # Process in chunks so large PDFs don't exceed context limits
        for i in range(0, len(pages), _PAGE_CHUNK):
            chunk_text = "\n\n--- PAGE BREAK ---\n\n".join(pages[i : i + _PAGE_CHUNK])
            charges = await self._call_claude(chunk_text, filename)
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
        return await self._call_claude(text, filename)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_year_from_filename(filename: str) -> int | None:
        """Extract a 4-digit year from a filename like 'CC ABR 2026.pdf'."""
        import re
        m = re.search(r'20\d{2}', filename)
        return int(m.group()) if m else None

    async def _call_claude(self, content: str, filename: str) -> list[ParsedCharge]:
        prompt = f"""You are a bank statement parser. Extract every individual financial transaction from the text below.

Return ONLY a valid JSON array — no markdown, no explanation, nothing else. Each element:
{{"date": "YYYY-MM-DD", "description": "string", "amount": number, "cuota_numero": number|null, "cuota_total": number|null, "cuota_monto": number|null}}

Rules:
- amount sign convention:
  - POSITIVE = expense / debit / charge / payment made / purchase
  - NEGATIVE = income / credit / money received — this includes: salary / remuneración / sueldo, deposits / abonos, incoming transfers / transferencias recibidas, refunds / devoluciones, interest earned, cashback
- Skip: column headers, balance rows, section titles, page numbers, summary totals
- Include: every individual transaction line, both expenses AND income
- date: always YYYY-MM-DD — if the statement only shows DD/MM without a year (common in Chilean bank statements like Itaú), infer the year from the period header (e.g. "Período: 01-Abr-2026 - 30-Abr-2026" → year 2026), the filename, or any header date. Never omit the year.
- amount: plain integer or decimal, no currency symbols. IMPORTANT: many Latin American bank statements use . as the thousands separator and , as the decimal separator (e.g. "$1.440" = 1440, "$28.260" = 28260, "$1.234.567" = 1234567). Remove ALL thousands-separator dots and output the raw integer value
- cuota_numero / cuota_total: ONLY extract from a dedicated installment-number column (labeled "Nº CUOTA", "N° CUOTA", "CUOTAS" or similar). Format is always current/total (e.g. "04/35" → cuota_numero=4, cuota_total=35). cuota_total can be a large number like 35, 48 or 60 — that is normal. NEVER derive cuota data from interest rates, percentages, page numbers, or any non-cuota field. If the row has no installment column, set both to null.
- cuota_monto: the periodic installment amount from "VALOR CUOTA MENSUAL" or equivalent column. Set null if not present.
- amount: for installment rows (cuota_numero is not null) use the cuota_monto (monthly payment), NOT the outstanding balance or "monto total a pagar". For non-installment rows use the actual charge amount.

Bank statement (file: {filename or "unknown"}):
{content}"""

        log.info("claude_parser_calling", filename=filename, content_chars=len(content), content_preview=content[:200])
        try:
            from anthropic.types import TextBlock
            message = await self._client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=8192,
                messages=[{"role": "user", "content": prompt}],
            )
            text_block = next((b for b in message.content if isinstance(b, TextBlock)), None)
            if text_block is None:
                log.warning("claude_parser_no_text_block", stop_reason=message.stop_reason)
                return []
            log.info("claude_parser_response", stop_reason=message.stop_reason, response_chars=len(text_block.text), response_preview=text_block.text[:300])
            fallback_year = self._extract_year_from_filename(filename)
            charges = self._parse_response(text_block.text, fallback_year)
            log.info("claude_parser_done", filename=filename, charges=len(charges))
            return charges
        except Exception as exc:
            log.warning(
                "claude_parser_error",
                error=str(exc),
                filename=filename,
                hint="Check ANTHROPIC_API_KEY and account credits at console.anthropic.com",
            )
            raise RuntimeError(
                f"Claude parsing failed: {exc}. "
                "Ensure ANTHROPIC_API_KEY is set and the account has credits."
            ) from exc

    def _parse_response(self, text: str, fallback_year: int | None = None) -> list[ParsedCharge]:
        """Parse Claude's JSON response into ParsedCharge objects."""
        import re
        start = text.find("[")
        end = text.rfind("]") + 1
        # end == 0 means no closing ] — response was truncated at max_tokens.
        # Fall through to partial recovery instead of returning empty.
        if start == -1:
            log.warning("claude_parser_no_json_array", response_preview=text[:200])
            return []
        data: list[Any] = []
        if end > start:
            try:
                data = json.loads(text[start:end])
            except json.JSONDecodeError as exc:
                log.warning("claude_parser_invalid_json", error=str(exc), response_preview=text[:200])
        if not data:
            # Partial recovery: extract complete {...} objects from truncated JSON
            partial: list[Any] = []
            for m in re.finditer(r'\{[^{}]*\}', text[start:]):
                try:
                    partial.append(json.loads(m.group()))
                except json.JSONDecodeError:
                    continue
            if partial:
                log.info("claude_parser_partial_recovery", recovered=len(partial))
                data = partial
            else:
                return []

        charges: list[ParsedCharge] = []
        skipped = 0
        for item in data:
            try:
                parsed_date = self._parse_date(str(item.get("date", "")), fallback_year)
                if parsed_date is None:
                    log.debug("claude_parser_skip_bad_date", date=item.get("date"))
                    skipped += 1
                    continue
                description = str(item.get("description", "")).strip()
                if not description:
                    skipped += 1
                    continue
                # Parse amount: handle int, float, or string with currency symbols/Chilean format
                raw = item.get("amount", 0)
                if isinstance(raw, (int, float)):
                    amount = Decimal(str(int(raw) if isinstance(raw, float) and raw == int(raw) else raw))
                else:
                    import re as _re
                    raw_str = str(raw).replace("$", "").strip()
                    # Chilean thousands separator: "8.398" or "1.234.567" → no decimal
                    if _re.match(r'^\d{1,3}(\.\d{3})+$', raw_str):
                        raw_str = raw_str.replace(".", "")
                    amount = Decimal(raw_str)
                cuota_numero = int(item["cuota_numero"]) if item.get("cuota_numero") else None
                cuota_total = int(item["cuota_total"]) if item.get("cuota_total") else None
                cuota_monto = Decimal(str(item["cuota_monto"])) if item.get("cuota_monto") else None
                charges.append(ParsedCharge(
                    date=parsed_date, description=description, amount=amount,
                    cuota_numero=cuota_numero, cuota_total=cuota_total, cuota_monto=cuota_monto,
                ))
            except (InvalidOperation, TypeError, KeyError) as exc:
                log.debug("claude_parser_skip_item", error=str(exc), item=str(item)[:100])
                skipped += 1
                continue
        if skipped:
            log.warning("claude_parser_items_skipped", skipped=skipped, total=len(data))

        return charges

    @staticmethod
    def _parse_date(date_str: str, fallback_year: int | None = None) -> date | None:
        # Claude is instructed to always return YYYY-MM-DD.
        # Chilean banks use DD/MM/YYYY — never MM/DD/YYYY (US format), which we
        # intentionally omit to avoid ambiguous misparsing (e.g. "01/12/2025"
        # being read as January 12 instead of December 1).
        for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y"]:
            try:
                return datetime.strptime(date_str.strip(), fmt).date()
            except ValueError:
                continue
        # Fallback: DD/MM without year (e.g. Itaú cartolas show "01/04")
        try:
            parsed = datetime.strptime(date_str.strip(), "%d/%m")
            year = fallback_year or datetime.now().year
            return parsed.replace(year=year).date()
        except ValueError:
            pass
        return None
