"""Integration-style tests for /api/charges endpoints using mocked dependencies."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import ASGITransport, AsyncClient

from infrastructure.auth.supabase_middleware import get_current_user_id
from infrastructure.database.connection import get_db
from presentation.dependencies import get_category_repo, get_charge_repo
from presentation.main import app
from tests.conftest import (
    MockCategoryRepo,
    MockChargeRepo,
    TEST_USER_ID,
    make_category,
    make_charge,
    make_token,
    make_user,
)


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token()}"}


def _mock_db_dependency():
    """Async generator that yields a mock AsyncSession."""
    async def _gen():
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=result)

        async def _refresh(obj: object) -> None:
            if not getattr(obj, "created_at", None):
                object.__setattr__(obj, "created_at", datetime.now(timezone.utc))

        db.refresh = _refresh
        yield db

    return _gen


def _client_with_mocks(charge_repo: MockChargeRepo, category_repo: MockCategoryRepo | None = None):
    """Return an AsyncClient with mocked charge/category repos and auth."""
    cat_repo = category_repo or MockCategoryRepo()
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID
    app.dependency_overrides[get_charge_repo] = lambda: charge_repo
    app.dependency_overrides[get_category_repo] = lambda: cat_repo
    app.dependency_overrides[get_db] = _mock_db_dependency()
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _clear_overrides():
    app.dependency_overrides.clear()


# ── GET /api/charges/ ──────────────────────────────────────────────────────────
class TestListCharges:
    async def test_returns_personal_charges(self):
        charge = make_charge(description="Uber", amount=Decimal("3500"))
        charge.statement_type = "manual"
        charge.uploaded_by = TEST_USER_ID
        repo = MockChargeRepo([charge])

        with patch("presentation.api.charges.SQLUserRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=make_user())
            async with _client_with_mocks(repo) as c:
                resp = await c.get("/api/charges/", headers=_headers())
        _clear_overrides()

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["description"] == "Uber"

    async def test_unauthenticated_returns_401(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/charges/")
        assert resp.status_code == 401

    async def test_empty_when_no_charges(self):
        repo = MockChargeRepo([])
        with patch("presentation.api.charges.SQLUserRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=make_user())
            async with _client_with_mocks(repo) as c:
                resp = await c.get("/api/charges/", headers=_headers())
        _clear_overrides()

        assert resp.status_code == 200
        assert resp.json() == []


# ── POST /api/charges/manual ───────────────────────────────────────────────────
class TestCreateManualCharge:
    async def test_creates_charge_not_shared(self):
        """Manual charges must default to is_shared=False."""
        with patch("presentation.api.charges.SQLUserRepository"):
            async with _client_with_mocks(MockChargeRepo()) as c:
                resp = await c.post(
                    "/api/charges/manual",
                    headers=_headers(),
                    json={"amount": "5000", "description": "Almuerzo", "date": "2026-03-01", "currency": "CLP"},
                )
        _clear_overrides()

        assert resp.status_code == 200
        data = resp.json()
        assert data["description"] == "Almuerzo"
        assert data["is_shared"] is False

    async def test_creates_charge_with_category(self):
        cat_id = str(uuid.uuid4())
        with patch("presentation.api.charges.SQLUserRepository"):
            async with _client_with_mocks(MockChargeRepo()) as c:
                resp = await c.post(
                    "/api/charges/manual",
                    headers=_headers(),
                    json={
                        "amount": "9990",
                        "description": "Netflix",
                        "date": "2026-03-01",
                        "currency": "CLP",
                        "category_id": cat_id,
                    },
                )
        _clear_overrides()

        assert resp.status_code == 200
        assert resp.json()["category_id"] == cat_id

    async def test_missing_required_fields_returns_422(self):
        app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID
        app.dependency_overrides[get_charge_repo] = lambda: MockChargeRepo()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/charges/manual", headers=_headers(), json={})
        _clear_overrides()
        assert resp.status_code == 422


# ── POST /api/charges/bulk-confirm ────────────────────────────────────────────
class TestBulkConfirm:
    async def test_shares_charges(self):
        charges = [make_charge(is_shared=False), make_charge(is_shared=False)]
        repo = MockChargeRepo(charges)
        ids = [str(c.id) for c in charges]

        async with _client_with_mocks(repo) as c:
            resp = await c.post(
                "/api/charges/bulk-confirm",
                headers=_headers(),
                json={"charge_ids": ids},
            )
        _clear_overrides()

        assert resp.status_code == 200
        assert resp.json()["confirmed"] == 2

    async def test_empty_list(self):
        repo = MockChargeRepo()
        async with _client_with_mocks(repo) as c:
            resp = await c.post(
                "/api/charges/bulk-confirm",
                headers=_headers(),
                json={"charge_ids": []},
            )
        _clear_overrides()
        assert resp.status_code == 200
        assert resp.json()["confirmed"] == 0


# ── POST /api/charges/bulk-unshare ────────────────────────────────────────────
class TestBulkUnshare:
    async def test_unshares_charges(self):
        charges = [make_charge(is_shared=True), make_charge(is_shared=True)]
        repo = MockChargeRepo(charges)
        ids = [str(c.id) for c in charges]

        async with _client_with_mocks(repo) as c:
            resp = await c.post(
                "/api/charges/bulk-unshare",
                headers=_headers(),
                json={"charge_ids": ids},
            )
        _clear_overrides()

        assert resp.status_code == 200
        assert resp.json()["unshared"] == 2
        assert all(not c.is_shared for c in charges)

    async def test_empty_list(self):
        repo = MockChargeRepo()
        async with _client_with_mocks(repo) as c:
            resp = await c.post(
                "/api/charges/bulk-unshare",
                headers=_headers(),
                json={"charge_ids": []},
            )
        _clear_overrides()
        assert resp.status_code == 200
        assert resp.json()["unshared"] == 0


# ── GET /api/charges/categories ───────────────────────────────────────────────
class TestListCategories:
    async def test_returns_categories(self):
        cat = make_category(name="Transporte")
        cat_repo = MockCategoryRepo([cat])

        with patch("presentation.api.charges.SQLUserRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=make_user())
            async with _client_with_mocks(MockChargeRepo(), cat_repo) as c:
                resp = await c.get("/api/charges/categories", headers=_headers())
        _clear_overrides()

        assert resp.status_code == 200
        names = [c["name"] for c in resp.json()]
        assert "Transporte" in names
