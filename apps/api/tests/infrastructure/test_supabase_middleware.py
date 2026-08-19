"""Unit tests for the auth-unification logic in supabase_middleware.

Covers the dual-verification path added to migrate off finances-app's own JWT
issuance onto Supabase Auth JWTs (JWKS/ES256), without breaking the legacy
HS256 tokens still used by the standalone frontend during the transition
window. See Notion "Integración Finanzas — Auth unificado (Supabase JWT)".
"""
from __future__ import annotations

from typing import cast
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jwt import PyJWTError
from sqlalchemy.ext.asyncio import AsyncSession

from infrastructure.auth import supabase_middleware
from infrastructure.auth.supabase_middleware import create_access_token, get_current_user_id
from tests.conftest import make_user

FAKE_DB = cast(AsyncSession, object())
SUPABASE_UID = uuid4()


def _credentials(token: str = "fake-token") -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _patch_repo():
    """Patch the SQLUserRepository used inside supabase_middleware with an AsyncMock."""
    return patch("infrastructure.auth.supabase_middleware.SQLUserRepository")


# ── Supabase JWT verified → local user resolution ───────────────────────────────
class TestResolveSupabaseUser:
    async def test_matches_existing_supabase_user_id(self):
        existing = make_user()
        payload = {"sub": str(SUPABASE_UID), "email": existing.email}
        with (
            patch.object(supabase_middleware, "_decode_supabase_jwt", return_value=payload),
            _patch_repo() as mock_repo_cls,
        ):
            mock_repo = mock_repo_cls.return_value
            mock_repo.get_by_supabase_user_id = AsyncMock(return_value=existing)
            mock_repo.get_by_email = AsyncMock()
            mock_repo.link_supabase_user_id = AsyncMock()
            mock_repo.create_from_supabase = AsyncMock()

            result = await get_current_user_id(_credentials(), db=FAKE_DB)

        assert result == existing.id
        mock_repo.get_by_email.assert_not_called()
        mock_repo.link_supabase_user_id.assert_not_called()
        mock_repo.create_from_supabase.assert_not_called()

    async def test_links_existing_user_found_by_email(self):
        existing = make_user()
        linked = make_user()
        linked.supabase_user_id = SUPABASE_UID
        payload = {"sub": str(SUPABASE_UID), "email": existing.email}
        with (
            patch.object(supabase_middleware, "_decode_supabase_jwt", return_value=payload),
            _patch_repo() as mock_repo_cls,
        ):
            mock_repo = mock_repo_cls.return_value
            mock_repo.get_by_supabase_user_id = AsyncMock(return_value=None)
            mock_repo.get_by_email = AsyncMock(return_value=existing)
            mock_repo.link_supabase_user_id = AsyncMock(return_value=linked)
            mock_repo.create_from_supabase = AsyncMock()

            result = await get_current_user_id(_credentials(), db=FAKE_DB)

        mock_repo.link_supabase_user_id.assert_awaited_once_with(existing.id, SUPABASE_UID)
        mock_repo.create_from_supabase.assert_not_called()
        assert result == linked.id

    async def test_jit_provisions_new_user_when_no_match(self):
        created = make_user()
        with (
            patch.object(
                supabase_middleware,
                "_decode_supabase_jwt",
                return_value={
                    "sub": str(SUPABASE_UID),
                    "email": "new-user@example.com",
                    "user_metadata": {"full_name": "New User"},
                },
            ),
            _patch_repo() as mock_repo_cls,
        ):
            mock_repo = mock_repo_cls.return_value
            mock_repo.get_by_supabase_user_id = AsyncMock(return_value=None)
            mock_repo.get_by_email = AsyncMock(return_value=None)
            mock_repo.create_from_supabase = AsyncMock(return_value=created)

            result = await get_current_user_id(_credentials(), db=FAKE_DB)

        mock_repo.create_from_supabase.assert_awaited_once_with(
            email="new-user@example.com", supabase_user_id=SUPABASE_UID, full_name="New User"
        )
        assert result == created.id

    async def test_missing_email_and_no_local_match_raises_401(self):
        with (
            patch.object(supabase_middleware, "_decode_supabase_jwt", return_value={"sub": str(SUPABASE_UID)}),
            _patch_repo() as mock_repo_cls,
        ):
            mock_repo = mock_repo_cls.return_value
            mock_repo.get_by_supabase_user_id = AsyncMock(return_value=None)

            with pytest.raises(HTTPException) as exc_info:
                await get_current_user_id(_credentials(), db=FAKE_DB)

        assert exc_info.value.status_code == 401

    async def test_missing_sub_raises_401(self):
        with patch.object(supabase_middleware, "_decode_supabase_jwt", return_value={"email": "x@example.com"}):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user_id(_credentials(), db=FAKE_DB)

        assert exc_info.value.status_code == 401


# ── Dual verification: Supabase JWT first, legacy HS256 as fallback ────────────
class TestDualVerification:
    async def test_falls_back_to_legacy_token_when_supabase_verification_fails(self):
        legacy_user_id = uuid4()
        with (
            patch.object(supabase_middleware, "_decode_supabase_jwt", side_effect=PyJWTError("bad token")),
            patch.object(supabase_middleware, "_decode_legacy_jwt", return_value={"sub": str(legacy_user_id)}),
            _patch_repo() as mock_repo_cls,
        ):
            result = await get_current_user_id(_credentials(), db=FAKE_DB)

        assert result == legacy_user_id
        mock_repo_cls.assert_not_called()

    async def test_both_verifications_failing_raises_401(self):
        with (
            patch.object(supabase_middleware, "_decode_supabase_jwt", side_effect=PyJWTError("bad token")),
            patch.object(supabase_middleware, "_decode_legacy_jwt", side_effect=PyJWTError("also bad")),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user_id(_credentials(), db=FAKE_DB)

        assert exc_info.value.status_code == 401

    async def test_legacy_token_missing_sub_raises_401(self):
        with (
            patch.object(supabase_middleware, "_decode_supabase_jwt", side_effect=PyJWTError("bad token")),
            patch.object(supabase_middleware, "_decode_legacy_jwt", return_value={}),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user_id(_credentials(), db=FAKE_DB)

        assert exc_info.value.status_code == 401


# ── create_access_token (legacy issuance, unchanged) ────────────────────────────
class TestCreateAccessToken:
    def test_round_trips_through_legacy_decode(self):
        user_id = uuid4()
        token = create_access_token(str(user_id))

        payload = supabase_middleware._decode_legacy_jwt(token)

        assert UUID(payload["sub"]) == user_id
