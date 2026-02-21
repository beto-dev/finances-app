from abc import ABC, abstractmethod
from domain.entities.charge import ParsedCharge


class BaseParser(ABC):
    @abstractmethod
    async def parse(self, file_bytes: bytes, filename: str = "") -> list[ParsedCharge]:
        """Parse file bytes and return a list of normalized charges."""
        ...
