import os

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health_check():
    anthropic_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    groq_key = bool(os.environ.get("GROQ_API_KEY"))
    gemini_key = bool(os.environ.get("GEMINI_API_KEY"))

    if groq_key:
        parser = "groq"
    elif gemini_key:
        parser = "gemini"
    elif anthropic_key:
        parser = "claude"
    else:
        parser = "none"

    return {
        "status": "ok",
        "service": "finances-api",
        "parser": parser,
    }


@router.get("/health/parser-test")
async def parser_test():
    """Quick smoke-test: verifies the active AI parser can make a real API call."""
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=10,
            messages=[{"role": "user", "content": "Reply with the number 1"}],
        )
        return {"ok": True, "response": msg.content[0].text if msg.content else ""}
    except Exception as e:
        return {"ok": False, "error": str(e)}
