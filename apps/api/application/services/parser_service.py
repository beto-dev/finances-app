import structlog
from domain.entities.charge import ParsedCharge
from infrastructure.ai.claude_parser import ClaudeParser
from infrastructure.ai.gemini_parser import GeminiParser
from infrastructure.ai.groq_parser import GroqParser
from infrastructure.parsers.pdf_parser import PDFParser
from infrastructure.parsers.csv_parser import CSVParser
from infrastructure.parsers.excel_parser import ExcelParser

log = structlog.get_logger()


class ParserService:
    def __init__(self) -> None:
        groq = GroqParser()
        gemini = GeminiParser()
        claude = ClaudeParser()

        if groq.is_available:
            llm = groq
            log.info("parser_backend", backend="groq")
        elif gemini.is_available:
            llm = gemini
            log.info("parser_backend", backend="gemini")
        elif claude.is_available:
            llm = claude
            log.info("parser_backend", backend="claude")
        else:
            llm = groq  # will fail at parse time with a clear error
            log.warning(
                "parser_backend_unavailable",
                hint="Set GROQ_API_KEY (free at console.groq.com) in .env",
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
