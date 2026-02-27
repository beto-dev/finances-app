from datetime import datetime

from pydantic import BaseModel


class GoogleAuthStatusResponse(BaseModel):
    connected: bool
    spreadsheet_url: str | None
    last_sync_at: datetime | None


class SyncResponse(BaseModel):
    synced: int
    months: list[str]
