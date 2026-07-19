from pydantic import BaseModel


class ChatMessageIn(BaseModel):
    message: str
    history: list[dict[str, str]]


class ChatMessageOut(BaseModel):
    reply: str
