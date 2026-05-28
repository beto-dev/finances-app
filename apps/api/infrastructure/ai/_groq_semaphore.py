"""Global semaphore shared by all Groq callers to stay within 30 RPM."""
import asyncio

# Allow at most 2 concurrent Groq calls across parser + categorizer
_semaphore: asyncio.Semaphore | None = None


def get() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(2)
    return _semaphore
