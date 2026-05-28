import structlog

from domain.entities.charge import ParsedCharge
from infrastructure.ai.claude_parser import ClaudeParser
from infrastructure.ai.gemini_parser import GeminiParser
from infrastructure.ai.groq_parser import GroqParser
from infrastructure.parsers.csv_parser import CSVParser
from infrastructure.parsers.excel_parser import ExcelParser
from infrastructure.parsers.pdf_parser import PDFParser

log = structlog.get_logger()


class ParserService:
    def __init__(self) -> None:
        gemini = GeminiParser()
        groq = GroqParser()
        claude = ClaudeParser()

        llm: GroqParser | GeminiParser | ClaudeParser
        if gemini.is_available:
            llm = gemini
            log.info("parser_backend", backend="gemini")
        elif groq.is_available:
            llm = groq
            log.info("parser_backend", backend="groq")
        elif claude.is_available:
            llm = claude
            log.info("parser_backend", backend="claude")
        else:
            llm = gemini  # will fail at parse time with a clear error
            log.warning(
                "parser_backend_unavailable",
                hint="Set GEMINI_API_KEY (free at aistudio.google.com/app/apikey) in .env",
            )

        self._parsers = {
            "pdf": PDFParser(llm),
            "csv": CSVParser(llm),
            "xlsx": ExcelParser(llm),
            "xls": ExcelParser(llm),
        }

    async def parse(self, file_bytes: bytes, filename: str) -> list[ParsedCharge]:
        ext = filename.rsplit(".", 1)[-1].lower()
        parser = self._parsers.get(ext)
        if parser is None:
            raise ValueError(
                f"Unsupported file format: .{ext}. Supported: pdf, csv, xlsx, xls"
            )
        return await parser.parse(file_bytes, filename)
