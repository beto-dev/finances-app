import os
from urllib.parse import urlencode


GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
    "openid",
    "email",
]


class GoogleOAuthClient:
    def __init__(self) -> None:
        self._client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
        self._client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
        self._redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/google/callback")

    def get_authorization_url(self, state: str) -> str:
        params = {
            "client_id": self._client_id,
            "redirect_uri": self._redirect_uri,
            "response_type": "code",
            "scope": " ".join(GOOGLE_SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str) -> dict:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                    "redirect_uri": self._redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            response.raise_for_status()
            return response.json()

    async def refresh_token(self, refresh_token: str) -> dict:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "refresh_token": refresh_token,
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                    "grant_type": "refresh_token",
                },
            )
            response.raise_for_status()
            return response.json()
