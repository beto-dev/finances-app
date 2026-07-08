"""Tests for ChatWithDataUseCase."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from application.use_cases.chat_with_data import ChatWithDataUseCase
from tests.conftest import (
    TEST_USER_ID,
    MockCategoryRepo,
    MockChargeRepo,
    MockUserRepo,
    make_category,
    make_charge,
    make_user,
)


@dataclass
class _ToolUseBlock:
    name: str
    input: dict[str, Any]
    id: str = "tool_1"
    type: str = "tool_use"


@dataclass
class _TextBlock:
    text: str
    type: str = "text"


@dataclass
class _FakeResponse:
    content: list[Any]
    stop_reason: str


class _FakeMessages:
    def __init__(self, responses: list[_FakeResponse]) -> None:
        self._responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> _FakeResponse:
        self.calls.append(kwargs)
        return self._responses.pop(0)


class _FakeAnthropicClient:
    def __init__(self, responses: list[_FakeResponse]) -> None:
        self.messages = _FakeMessages(responses)


class _AlwaysToolUseClient:
    """Simulates a model that keeps requesting tools forever, to test the round cap."""

    def __init__(self) -> None:
        self.messages = self
        self.call_count = 0

    async def create(self, **kwargs: Any) -> _FakeResponse:
        self.call_count += 1
        block = _ToolUseBlock(
            name="get_monthly_summary", input={"month": 3, "year": 2026}, id=f"t{self.call_count}"
        )
        return _FakeResponse(content=[block], stop_reason="tool_use")


class TestChatWithDataUseCase:
    async def test_direct_text_reply_without_tool_use(self) -> None:
        client = _FakeAnthropicClient(
            [_FakeResponse(content=[_TextBlock(text="Hola, ¿en qué te ayudo?")], stop_reason="end_turn")]
        )
        uc = ChatWithDataUseCase(MockChargeRepo(), MockCategoryRepo(), MockUserRepo(make_user()), client)

        reply = await uc.execute("hola", [], TEST_USER_ID)

        assert reply == "Hola, ¿en qué te ayudo?"

    async def test_resolves_monthly_summary_tool_call(self) -> None:
        family_id = uuid.uuid4()
        cat = make_category(name="Comida")
        charge = make_charge(amount=Decimal("5000"), category_id=cat.id, charge_date=date(2026, 3, 5))
        client = _FakeAnthropicClient(
            [
                _FakeResponse(
                    content=[_ToolUseBlock(name="get_monthly_summary", input={"month": 3, "year": 2026})],
                    stop_reason="tool_use",
                ),
                _FakeResponse(content=[_TextBlock(text="Gastaste $5.000 en marzo.")], stop_reason="end_turn"),
            ]
        )
        uc = ChatWithDataUseCase(
            MockChargeRepo([charge]),
            MockCategoryRepo([cat]),
            MockUserRepo(make_user(family_id=family_id)),
            client,
        )

        reply = await uc.execute("¿cuánto gasté en marzo?", [], TEST_USER_ID)

        assert reply == "Gastaste $5.000 en marzo."
        assert len(client.messages.calls) == 2
        tool_result_message = client.messages.calls[1]["messages"][-1]
        assert tool_result_message["role"] == "user"
        assert "5000" in tool_result_message["content"][0]["content"]

    async def test_stops_after_five_rounds_without_resolution(self) -> None:
        client = _AlwaysToolUseClient()
        uc = ChatWithDataUseCase(MockChargeRepo(), MockCategoryRepo(), MockUserRepo(make_user()), client)

        reply = await uc.execute("dame un resumen", [], TEST_USER_ID)

        assert reply == "No se pudo generar una respuesta."
        assert client.call_count == 5

    async def test_returns_message_when_user_not_found(self) -> None:
        client = _FakeAnthropicClient([])
        uc = ChatWithDataUseCase(MockChargeRepo(), MockCategoryRepo(), MockUserRepo(make_user()), client)

        reply = await uc.execute("hola", [], uuid.uuid4())

        assert reply == "No se pudo obtener la información del usuario."

    async def test_get_charges_filters_by_category_name(self) -> None:
        cat_food = make_category(name="Comida")
        cat_transport = make_category(name="Transporte")
        charge_food = make_charge(description="Restaurante", amount=Decimal("3000"), category_id=cat_food.id)
        charge_transport = make_charge(description="Uber", amount=Decimal("2000"), category_id=cat_transport.id)
        client = _FakeAnthropicClient(
            [
                _FakeResponse(
                    content=[_ToolUseBlock(name="get_charges", input={"category_name": "comida"})],
                    stop_reason="tool_use",
                ),
                _FakeResponse(content=[_TextBlock(text="Solo gastaste en Comida.")], stop_reason="end_turn"),
            ]
        )
        uc = ChatWithDataUseCase(
            MockChargeRepo([charge_food, charge_transport]),
            MockCategoryRepo([cat_food, cat_transport]),
            MockUserRepo(make_user()),
            client,
        )

        reply = await uc.execute("¿qué gasté en comida?", [], TEST_USER_ID)

        assert reply == "Solo gastaste en Comida."
        tool_result_message = client.messages.calls[1]["messages"][-1]
        result_json = tool_result_message["content"][0]["content"]
        assert "Restaurante" in result_json
        assert "Uber" not in result_json
