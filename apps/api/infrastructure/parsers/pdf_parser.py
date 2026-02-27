import io

from domain.entities.charge import ParsedCharge
from infrastructure.parsers.base_parser import BaseParser


class PDFParser(BaseParser):
    def __init__(self, llm) -> None:
        self._llm = llm

    async def parse(self, file_bytes: bytes, filename: str = "") -> list[ParsedCharge]:
        try:
            import pdfplumber
        except ImportError:
            raise ImportError("pdfplumber is required for PDF parsing.")

        pages: list[str] = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                if text.strip():
                    pages.append(text)

        return await self._llm.parse_pdf_pages(pages, filename)
