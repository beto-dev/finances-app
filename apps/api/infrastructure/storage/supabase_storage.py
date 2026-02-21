import os


class SupabaseStorage:
    """Placeholder Supabase Storage client. Replace with real implementation when Supabase is configured."""

    def __init__(self) -> None:
        self._url = os.environ.get("SUPABASE_URL", "")
        self._key = os.environ.get("SUPABASE_SERVICE_KEY", "")

    async def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> str:
        # TODO: Replace with real Supabase Storage upload
        # from supabase import create_client
        # client = create_client(self._url, self._key)
        # client.storage.from_(bucket).upload(path, data, {"content-type": content_type})
        return f"supabase://{bucket}/{path}"

    async def get_url(self, bucket: str, path: str) -> str:
        return f"{self._url}/storage/v1/object/public/{bucket}/{path}"

    async def delete(self, bucket: str, path: str) -> None:
        pass
