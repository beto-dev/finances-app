import io
import os
import subprocess
import tempfile

import structlog

from domain.entities.charge import ParsedCharge
from infrastructure.parsers.base_parser import BaseParser

log = structlog.get_logger()

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
        log.warning("pdf_pdftotext_failed", returncode=result.returncode, stderr=result.stderr[:200])
        return []
    except FileNotFoundError:
        log.warning("pdf_pdftotext_not_found")
        return []
    except subprocess.TimeoutExpired:
        log.warning("pdf_pdftotext_timeout")
        return []
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


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


def _extract_pages_pdfplumber(file_bytes: bytes, layout: bool = False) -> list[str]:
    import pdfplumber
    pages: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            if layout:
                text = page.extract_text(layout=True) or ""
            else:
                text = page.extract_text() or ""
            if text.strip():
                pages.append(text)
    return pages


class PDFParser(BaseParser):
    def __init__(self, llm) -> None:
        self._llm = llm

    async def parse(self, file_bytes: bytes, filename: str = "") -> list[ParsedCharge]:
        # 1. pdftotext -layout: most reliable for table-heavy statements.
        # pdftotext -layout preserves column positions with many spaces, which legitimately
        # lowers the readable-char ratio below _MIN_READABLE_RATIO — skip that check here.
        pages = _extract_pages_pdftotext(file_bytes)
        if pages:
            total_chars = sum(len(p) for p in pages)
            log.info("pdf_extractor_selected", method="pdftotext", pages=len(pages), chars=total_chars, preview=pages[0][:300])  # noqa: E501
            return await self._llm.parse_pdf_pages(pages, filename)

        # 2. pdfplumber with layout=True (pdfminer layout analysis — no external binary)
        try:
            pages = _extract_pages_pdfplumber(file_bytes, layout=True)
            if pages and _looks_readable(pages):
                total_chars = sum(len(p) for p in pages)
                log.info("pdf_extractor_selected", method="pdfplumber_layout", pages=len(pages), chars=total_chars, preview=pages[0][:300])  # noqa: E501
                return await self._llm.parse_pdf_pages(pages, filename)
        except Exception as exc:
            log.warning("pdf_pdfplumber_layout_failed", error=str(exc))

        # 3. pypdfium2: Chrome engine, good font/encoding support
        try:
            pages = _extract_pages_pypdfium2(file_bytes)
            if pages and _looks_readable(pages):
                total_chars = sum(len(p) for p in pages)
                log.info("pdf_extractor_selected", method="pypdfium2", pages=len(pages), chars=total_chars, preview=pages[0][:300])  # noqa: E501
                return await self._llm.parse_pdf_pages(pages, filename)
        except Exception as exc:
            log.warning("pdf_pypdfium2_failed", error=str(exc))

        # 4. pdfplumber default: last resort
        try:
            pages = _extract_pages_pdfplumber(file_bytes, layout=False)
            if pages and _looks_readable(pages):
                total_chars = sum(len(p) for p in pages)
                log.info("pdf_extractor_selected", method="pdfplumber_default", pages=len(pages), chars=total_chars, preview=pages[0][:300])  # noqa: E501
                return await self._llm.parse_pdf_pages(pages, filename)
        except Exception as exc:
            log.warning("pdf_pdfplumber_failed", error=str(exc))

        log.error("pdf_extraction_failed", filename=filename, file_size=len(file_bytes))
        raise RuntimeError("No se pudo extraer texto legible del PDF.")
