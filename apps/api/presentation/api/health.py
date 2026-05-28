import os

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health_check():
    anthropic_key = bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("APP_ANTHROPIC_API_KEY"))
    groq_key = bool(os.environ.get("GROQ_API_KEY"))
    gemini_key = bool(os.environ.get("GEMINI_API_KEY"))
    openrouter_key = bool(os.environ.get("OPENROUTER_API_KEY"))

    if openrouter_key:
        parser = "openrouter"
    elif gemini_key:
        parser = "gemini"
    elif groq_key:
        parser = "groq"
    elif anthropic_key:
        parser = "claude"
    else:
        parser = "none"

    return {
        "status": "ok",
        "service": "finances-api",
        "parser": parser,
    }


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


@router.get("/health/parser-test")
async def parser_test():
    """Smoke-test the active AI parser with a real API call."""
    groq_key = os.environ.get("GROQ_API_KEY", "")
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("APP_ANTHROPIC_API_KEY", "")
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "")

    try:
        if openrouter_key:
            import httpx
            from infrastructure.ai.openrouter_parser import _MODEL as openrouter_model
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {openrouter_key}", "HTTP-Referer": "https://finances-app"},
                    json={"model": openrouter_model, "messages": [{"role": "user", "content": "Reply with the number 1"}]},
                )
                response.raise_for_status()
                text = response.json()["choices"][0]["message"]["content"]
            return {"ok": True, "parser": "openrouter", "model": openrouter_model, "response": text}
        elif gemini_key:
            import asyncio
            from google import genai
            from infrastructure.ai.gemini_parser import _MODEL as gemini_model
            client = genai.Client(api_key=gemini_key)
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=gemini_model,
                contents="Reply with the number 1",
            )
            return {"ok": True, "parser": "gemini", "model": gemini_model, "response": response.text}
        elif groq_key:
            from groq import Groq
            import asyncio
            from infrastructure.ai.groq_parser import _MODEL as groq_model
            client = Groq(api_key=groq_key)
            response = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model=groq_model,
                    messages=[{"role": "user", "content": "Reply with the number 1"}],
                    max_tokens=10,
                )
            )
            return {"ok": True, "parser": "groq", "model": groq_model, "response": response.choices[0].message.content}
        elif anthropic_key:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=anthropic_key)
            msg = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=10,
                messages=[{"role": "user", "content": "Reply with the number 1"}],
            )
            return {"ok": True, "parser": "claude", "response": msg.content[0].text if msg.content else ""}
        else:
            return {"ok": False, "parser": "none", "error": "No API key configured"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
