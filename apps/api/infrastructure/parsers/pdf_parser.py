import io
import re

from domain.entities.charge import ParsedCharge
from infrastructure.parsers.base_parser import BaseParser

# Minimum ratio of "readable" characters (digits, letters, $) to total chars.
# Below this threshold the extraction is likely garbled (bad font encoding).
_MIN_READABLE_RATIO = 0.4


def _looks_readable(pages: list[str]) -> bool:
    text = " ".join(pages)
    if not text:
        return False
    readable = sum(1 for c in text if c.isalnum() or c in "$.,/-:")
    return (readable / len(text)) >= _MIN_READABLE_RATIO


def _extract_pages_pypdfium2(file_bytes: bytes) -> list[str]:
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument(file_bytes)
    pages: list[str] = []
    for page in doc:
        textpage = page.get_textpage()
        text = textpage.get_text_range()
        if text.strip():
            pages.append(text)
    return pages


def _extract_pages_pdfplumber(file_bytes: bytes) -> list[str]:
    import pdfplumber
    pages: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages.append(text)
    return pages


class PDFParser(BaseParser):
    def __init__(self, llm) -> None:
        self._llm = llm

    async def parse(self, file_bytes: bytes, filename: str = "") -> list[ParsedCharge]:
        pages: list[str] = []

        # Try pypdfium2 first — better font/encoding support (Chrome engine)
        try:
            pages = _extract_pages_pypdfium2(file_bytes)
        except Exception:
            pass

        # Fall back to pdfplumber if pypdfium2 extracted nothing or garbled text
        if not pages or not _looks_readable(pages):
            try:
                fallback = _extract_pages_pdfplumber(file_bytes)
                if fallback and _looks_readable(fallback):
                    pages = fallback
            except Exception:
                pass

        if not pages:
            raise RuntimeError("No se pudo extraer texto del PDF (pypdfium2 y pdfplumber fallaron).")

        return await self._llm.parse_pdf_pages(pages, filename)
