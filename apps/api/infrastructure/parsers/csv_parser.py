import io

from domain.entities.charge import ParsedCharge
from infrastructure.parsers.base_parser import BaseParser


class CSVParser(BaseParser):
    def __init__(self, llm) -> None:
        self._llm = llm

    async def parse(self, file_bytes: bytes, filename: str = "") -> list[ParsedCharge]:
        try:
            import pandas as pd
        except ImportError:
            raise ImportError("pandas is required for CSV parsing.")

        for sep in [",", ";", "\t", "|"]:
            try:
                df = pd.read_csv(
                    io.BytesIO(file_bytes),
                    sep=sep,
                    encoding="utf-8",
                    on_bad_lines="skip",
                    dtype=str,
                )
                if len(df.columns) >= 2 and len(df) >= 1:
                    rows = [list(df.columns)] + df.values.tolist()
                    result = await self._llm.parse_tabular(rows, filename)
                    if result:
                        return result
            except Exception:
                continue

        return []
