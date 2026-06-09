import io

from domain.entities.charge import ParsedCharge
from infrastructure.parsers.base_parser import BaseParser


def _extract_pages_pdfplumber(file_bytes: bytes) -> list[str]:
    import pdfplumber
    pages: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages.append(text)
    return pages


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


class PDFParser(BaseParser):
    def __init__(self, llm) -> None:
        self._llm = llm

    async def parse(self, file_bytes: bytes, filename: str = "") -> list[ParsedCharge]:
        pages: list[str] = []

        try:
            pages = _extract_pages_pdfplumber(file_bytes)
        except Exception:
            pass

        # Fall back to pypdfium2 if pdfplumber extracted nothing
        if not pages:
            try:
                pages = _extract_pages_pypdfium2(file_bytes)
            except Exception:
                pass

        if not pages:
            raise RuntimeError("No se pudo extraer texto del PDF (pdfplumber y pypdfium2 fallaron).")

        return await self._llm.parse_pdf_pages(pages, filename)
