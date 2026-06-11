import io
import os

from fastapi import APIRouter, File, UploadFile

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health_check():
    anthropic_key = bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("APP_ANTHROPIC_API_KEY"))
    groq_key = bool(os.environ.get("GROQ_API_KEY"))
    gemini_key = bool(os.environ.get("GEMINI_API_KEY"))
    openrouter_key = bool(os.environ.get("OPENROUTER_API_KEY"))

    if anthropic_key:
        parser = "claude"
    elif openrouter_key:
        parser = "openrouter"
    elif gemini_key:
        parser = "gemini"
    elif groq_key:
        parser = "groq"
    else:
        parser = "none"

    return {
        "status": "ok",
        "service": "finances-api",
        "parser": parser,
    }


@router.get("/health/openrouter-models")
async def openrouter_models():
    """List available free OpenRouter models."""
    import httpx
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        return {"error": "OPENROUTER_API_KEY not set"}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={"Authorization": f"Bearer {key}"},
            )
            r.raise_for_status()
            models = r.json().get("data", [])
            free = [m["id"] for m in models if ":free" in m.get("id", "")]
            return {"free_models": free[:30]}
    except Exception as e:
        return {"error": str(e)}


@router.get("/health/gemini-models")
async def gemini_models():
    """List available Gemini models that support generateContent."""
    import asyncio
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        return {"error": "GEMINI_API_KEY not set"}
    try:
        from google import genai
        client = genai.Client(api_key=gemini_key)
        models = await asyncio.to_thread(lambda: list(client.models.list()))
        names = [m.name for m in models if "generateContent" in (m.supported_actions or [])]
        return {"models": names}
    except Exception as e:
        return {"error": str(e)}


@router.get("/health/claude-credits")
async def claude_credits():
    """Check if Anthropic credits are available by making a minimal 1-token call."""
    import anthropic
    api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("APP_ANTHROPIC_API_KEY", "")
    if not api_key:
        return {"ok": False, "error": "ANTHROPIC_API_KEY not configured"}
    try:
        client = anthropic.AsyncAnthropic(api_key=api_key)
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1,
            messages=[{"role": "user", "content": "1"}],
        )
        usage = msg.usage
        return {
            "ok": True,
            "credits_available": True,
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
        }
    except anthropic.APIStatusError as e:
        low_credit = e.status_code in (402, 529) or "credit" in str(e).lower()
        return {
            "ok": False,
            "credits_available": False if low_credit else None,
            "status": e.status_code,
            "error": str(e.message),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/health/pdf-text")
async def pdf_text_extract(file: UploadFile = File(...)):
    """Return raw pdfplumber text extraction for debugging — shows exactly what Claude receives."""
    try:
        import pdfplumber
    except ImportError:
        return {"error": "pdfplumber not installed"}
    data = await file.read()
    pages = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            pages.append({"page": i + 1, "text": text[:3000]})
    return {"pages": pages, "total_pages": len(pages)}


@router.post("/health/cuota-parse-test")
async def cuota_parse_test(body: dict):
    """Send raw statement text to Claude and see the raw JSON it returns — for debugging cuota extraction."""
    api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("APP_ANTHROPIC_API_KEY", "")
    if not api_key:
        return {"error": "ANTHROPIC_API_KEY not configured"}
    text = body.get("text", "")
    if not text:
        return {"error": "Provide {\"text\": \"...statement lines...\"}"}
    import anthropic
    from anthropic.types import TextBlock
    prompt = f"""You are a bank statement parser. Extract every individual financial transaction from the text below.

Return ONLY a valid JSON array — no markdown, no explanation, nothing else. Each element:
{{"date": "YYYY-MM-DD", "description": "string", "amount": number, "cuota_numero": number|null, "cuota_total": number|null, "cuota_monto": number|null}}

Rules:
- amount: positive = expense / debit / charge; negative = credit / refund / payment received
- Skip: column headers, balance rows, section titles, page numbers, summary totals
- Include: every individual transaction line
- date: always YYYY-MM-DD regardless of the original format
- amount: plain integer or decimal, no currency symbols. IMPORTANT: many Latin American bank statements use . as the thousands separator and , as the decimal separator (e.g. "$1.440" = 1440, "$28.260" = 28260, "$1.234.567" = 1234567). Remove ALL thousands-separator dots and output the raw integer value
- cuota_numero / cuota_total: for installment purchases, extract the current and total installments from columns like "Nº CUOTA" (e.g. "02/03" → cuota_numero=2, cuota_total=3). Set null if not an installment.
- cuota_monto: the monthly installment amount from "VALOR CUOTA MENSUAL" column. Set null if not present.
- amount should be the amount charged this billing period (cuota_monto if available, otherwise the total)

Bank statement (file: debug):
{text}"""
    try:
        client = anthropic.AsyncAnthropic(api_key=api_key)
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = next((b.text for b in msg.content if isinstance(b, TextBlock)), "")
        return {"ok": True, "raw_response": raw, "input_tokens": msg.usage.input_tokens, "output_tokens": msg.usage.output_tokens}  # noqa: E501
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/health/parser-test")
async def parser_test():
    """Smoke-test the active AI parser with a real API call."""
    groq_key = os.environ.get("GROQ_API_KEY", "")
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("APP_ANTHROPIC_API_KEY", "")
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "")

    try:
        if openrouter_key:
            from infrastructure.ai.openrouter_parser import _MODEL as OPENROUTER_MODEL  # noqa: N811
            return {"ok": True, "parser": "openrouter", "model": OPENROUTER_MODEL, "note": "key configured, skipping live call"}  # noqa: E501
        elif gemini_key:
            import asyncio  # noqa: I001
            from google import genai  # type: ignore[import-untyped]
            from infrastructure.ai.gemini_parser import _MODEL as GEMINI_MODEL  # noqa: N811
            gemini_client = genai.Client(api_key=gemini_key)
            response = await asyncio.to_thread(
                gemini_client.models.generate_content,
                model=GEMINI_MODEL,
                contents="Reply with the number 1",
            )
            return {"ok": True, "parser": "gemini", "model": GEMINI_MODEL, "response": response.text}
        elif groq_key:
            import asyncio  # noqa: I001
            from groq import Groq  # type: ignore[import-untyped]
            from infrastructure.ai.groq_parser import _MODEL as GROQ_MODEL  # noqa: N811
            groq_client = Groq(api_key=groq_key)
            response = await asyncio.to_thread(
                lambda: groq_client.chat.completions.create(  # type: ignore[union-attr]
                    model=GROQ_MODEL,
                    messages=[{"role": "user", "content": "Reply with the number 1"}],
                    max_tokens=10,
                )
            )
            return {"ok": True, "parser": "groq", "model": GROQ_MODEL, "response": response.choices[0].message.content}  # type: ignore[union-attr]  # noqa: E501
        elif anthropic_key:
            import anthropic  # noqa: I001
            anthropic_client = anthropic.AsyncAnthropic(api_key=anthropic_key)
            msg = await anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=10,
                messages=[{"role": "user", "content": "Reply with the number 1"}],
            )
            return {"ok": True, "parser": "claude", "response": msg.content[0].text if msg.content else ""}
        else:
            return {"ok": False, "parser": "none", "error": "No API key configured"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
