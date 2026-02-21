import io
from domain.entities.charge import ParsedCharge
from infrastructure.parsers.base_parser import BaseParser


class ExcelParser(BaseParser):
    def __init__(self, llm) -> None:
        self._llm = llm

    async def parse(self, file_bytes: bytes, filename: str = "") -> list[ParsedCharge]:
        try:
            import pandas as pd
        except ImportError:
            raise ImportError("pandas and openpyxl are required for Excel parsing.")

        try:
            xls = pd.ExcelFile(io.BytesIO(file_bytes), engine="openpyxl")
            for sheet in xls.sheet_names:
                df = pd.read_excel(xls, sheet_name=sheet, dtype=str)
                if len(df.columns) >= 2 and len(df) >= 1:
                    rows = [list(df.columns)] + df.values.tolist()
                    result = await self._llm.parse_tabular(rows, filename)
                    if result:
                        return result
        except Exception:
            pass

        return []
