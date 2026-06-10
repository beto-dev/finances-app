import io
import os
import subprocess
import tempfile

from domain.entities.charge import ParsedCharge
from infrastructure.parsers.base_parser import BaseParser

# Minimum ratio of readable characters to detect garbled extraction
_MIN_READABLE_RATIO = 0.4


def _looks_readable(pages: list[str]) -> bool:
    text = " ".join(pages)
    if not text:
        return False
    readable = sum(1 for c in text if c.isalnum() or c in "$.,/-:")
    return (readable / len(text)) >= _MIN_READABLE_RATIO


def _extract_pages_pdftotext(file_bytes: bytes) -> list[str]:
    """Use poppler pdftotext -layout for best column-table preservation."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(file_bytes)
        tmp_path = f.name
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", tmp_path, "-"],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            pages = [p.strip() for p in result.stdout.split("\f") if p.strip()]
            return pages
        return []
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []
    finally:
        os.unlink(tmp_path)


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
        # 1. pdftotext -layout: best for table-heavy bank statements
        pages = _extract_pages_pdftotext(file_bytes)
        if pages and _looks_readable(pages):
            return await self._llm.parse_pdf_pages(pages, filename)

        # 2. pypdfium2: Chrome engine, good font/encoding support
        try:
            pages = _extract_pages_pypdfium2(file_bytes)
            if pages and _looks_readable(pages):
                return await self._llm.parse_pdf_pages(pages, filename)
        except Exception:
            pass

        # 3. pdfplumber: fallback
        try:
            pages = _extract_pages_pdfplumber(file_bytes)
            if pages and _looks_readable(pages):
                return await self._llm.parse_pdf_pages(pages, filename)
        except Exception:
            pass

        raise RuntimeError("No se pudo extraer texto legible del PDF.")
