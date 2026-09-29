"""Tests for the pydantic contracts (``app/schemas.py``).

Covers the one-product-per-event rule (both the scalar ``item_id`` and the
nested ``context`` item lists), mandatory purchase revenue, ``request_id``
identity/auto-fill, the closed ``EventType``/``Strategy`` enums, the minimal
ingestion shapes, and the response envelopes (including
:class:`SimilarResponse` intentionally having no ``cold_start``).
"""

from __future__ import annotations

import json
import re
import uuid

import pytest
from pydantic import ValidationError

from conftest import NOW, make_event
from recommendation.app.schemas import (
    EventIn,
    EventType,
    EventValue,
    ItemIn,
    RecResponse,
    ScoredItem,
    SimilarResponse,
    Strategy,
    UserIn,
    uuid4_hex,
)

HEX32 = re.compile(r"[0-9a-f]{32}")


@pytest.mark.parametrize(
    "value",
    [
        None,
        EventValue(),
        EventValue(quantity=1),
        EventValue(unit_price_cents=1999),
        EventValue(quantity=1, unit_price_cents=1999),
    ],
    ids=["None", "value1", "value2", "value3", "value4"],
)
def test_purchase_without_revenue_rejected(value: EventValue | None) -> None:
    """A purchase without unit_price_cents + quantity + currency is rejected."""
    with pytest.raises(ValidationError) as excinfo:
        EventIn(
            user_id="user-001",
            item_id="boo-001",
            event_type=EventType.purchase,
            timestamp=NOW,
            value=value,
        )
    assert "require" in str(excinfo.value)

    # The same (revenue-free) value is perfectly valid on a non-purchase event.
    if value is not None:
        ok = EventIn(
            user_id="user-001",
            item_id="boo-001",
            event_type=EventType.view,
            timestamp=NOW,
            value=value,
        )
        assert ok.value == value


def test_valid_purchase_parses() -> None:
    """A purchase carrying full revenue parses and round-trips through JSON."""
    value = EventValue(quantity=2, unit_price_cents=1999, currency="USD")
    event = make_event("user-001", "boo-001", EventType.purchase, value=value)

    assert event.event_type is EventType.purchase
    assert event.value is not None
    assert (event.value.quantity, event.value.unit_price_cents, event.value.currency) == (
        2,
        1999,
        "USD",
    )

    payload = event.model_dump(mode="json")
    assert payload["event_type"] == "purchase"
    assert payload["value"] == {
        "rating": None,
        "quantity": 2,
        "unit_price_cents": 1999,
        "currency": "USD",
        "query": None,
    }

    reparsed = EventIn.model_validate(payload)
    assert reparsed.request_id == event.request_id
    assert reparsed.timestamp == event.timestamp
    assert reparsed.value == value

    # An empty currency is treated as missing revenue.
    with pytest.raises(ValidationError):
        EventIn(
            user_id="user-001",
            item_id="boo-001",
            event_type=EventType.purchase,
            timestamp=NOW,
            value=EventValue(quantity=1, unit_price_cents=1, currency=""),
        )

    # A bare purchase with no value at all is rejected too.
    with pytest.raises(ValidationError):
        EventIn(
            user_id="user-001",
            item_id="boo-001",
            event_type=EventType.purchase,
            timestamp=NOW,
        )


def test_multi_item_cart_rejected() -> None:
    """``item_id`` must be a single scalar product id, never a collection."""
    with pytest.raises(ValidationError) as excinfo:
        EventIn(
            user_id="user-001",
            item_id=["ele-001", "ele-002"],
            event_type=EventType.cart,
            timestamp=NOW,
        )
    message = str(excinfo.value)
    assert "exactly one product" in message
    assert "item_id" in message

    # Every collection form is rejected for cart and purchase alike.
    collections = [
        ("ele-001", "ele-002"),
        {"ele-001", "ele-002"},
        frozenset({"ele-001"}),
        {"item_id": "ele-001"},
    ]
    for bad in collections:
        for event_type in (EventType.cart, EventType.purchase):
            value = (
                EventValue(quantity=1, unit_price_cents=100, currency="USD")
                if event_type is EventType.purchase
                else None
            )
            with pytest.raises(ValidationError):
                EventIn(
                    user_id="user-001",
                    item_id=bad,
                    event_type=event_type,
                    timestamp=NOW,
                    value=value,
                )

    # A single scalar product id is accepted and stays a string.
    ok = make_event("user-001", "ele-001", EventType.cart)
    assert ok.item_id == "ele-001"
    assert isinstance(ok.item_id, str)
    assert ok.model_dump(mode="json")["item_id"] == "ele-001"


def test_multi_item_cart_context_list_rejected() -> None:
    """Nested item lists in ``context`` are rejected for cart/purchase events."""
    for key in ("items", "item_ids"):
        with pytest.raises(ValidationError) as excinfo:
            EventIn(
                user_id="user-001",
                item_id="ele-001",
                event_type=EventType.cart,
                timestamp=NOW,
                context={key: ["ele-001", "ele-002"]},
            )
        message = str(excinfo.value)
        assert "exactly one product" in message
        assert key in message

        # Tuples are rejected as well.
        with pytest.raises(ValidationError):
            EventIn(
                user_id="user-001",
                item_id="ele-001",
                event_type=EventType.purchase,
                timestamp=NOW,
                value=EventValue(quantity=1, unit_price_cents=100, currency="USD"),
                context={key: ("ele-001", "ele-002")},
            )

    # Only cart/purchase enforce this, and only for list/tuple values: a
    # scalar under the same key is just context, not an item list.
    ok = EventIn(
        user_id="user-001",
        item_id="ele-001",
        event_type=EventType.view,
        timestamp=NOW,
        context={"items": ["ele-001", "ele-002"], "channel": "web"},
    )
    assert ok.context == {"items": ["ele-001", "ele-002"], "channel": "web"}

    scalar = EventIn(
        user_id="user-001",
        item_id="ele-001",
        event_type=EventType.cart,
        timestamp=NOW,
        context={"items": "ele-001", "channel": "web"},
    )
    assert scalar.context == {"items": "ele-001", "channel": "web"}


def test_unknown_event_type_rejected() -> None:
    """``event_type`` is a closed enum of exactly 8 members."""
    assert [member.value for member in EventType] == [
        "view",
        "click",
        "cart",
        "purchase",
        "wishlist",
        "rating",
        "impression",
        "search",
    ]
    assert EventType("view") is EventType.view

    for bad in ("purchasee", "browse", "Purchase", "", 3, None, ["view"]):
        with pytest.raises(ValidationError):
            EventIn(
                user_id="user-001",
                item_id="ele-001",
                event_type=bad,
                timestamp=NOW,
            )

    # The enum is a str enum, so the wire value is the member value.
    event = make_event("user-001", "ele-001", EventType.impression)
    assert isinstance(event.event_type, str)
    assert event.model_dump(mode="json")["event_type"] == "impression"


def test_duplicate_request_id_single_identity() -> None:
    """A caller-supplied request_id is the event's single identity, kept verbatim."""
    shared = "req-shared-0001"
    first = make_event("user-001", "ele-001", EventType.click, request_id=shared)
    second = make_event("user-001", "ele-002", EventType.click, request_id=shared)

    assert first.request_id == shared
    assert second.request_id == shared
    assert first.request_id == second.request_id
    assert uuid4_hex() != shared

    # The id is not regenerated or uniquified: both models carry it, and it
    # survives a JSON round-trip used for the Kafka message headers.
    assert first.model_dump(mode="json")["request_id"] == shared
    assert second.model_dump(mode="json")["request_id"] == shared
    assert (
        EventIn.model_validate(first.model_dump(mode="json")).request_id == shared
    )

    # The two events remain distinct models despite the shared identity.
    assert first is not second
    assert first.item_id == "ele-001"
    assert second.item_id == "ele-002"
    assert first.model_dump() != second.model_dump()


def test_missing_request_id_autofilled_uuid4() -> None:
    """An omitted request_id is auto-filled with a random uuid4 hex string."""
    event = EventIn(
        user_id="user-001",
        item_id="ele-001",
        event_type=EventType.view,
        timestamp=NOW,
    )
    assert HEX32.fullmatch(event.request_id)
    assert uuid.UUID(hex=event.request_id).version == 4

    other = EventIn(
        user_id="user-001",
        item_id="ele-001",
        event_type=EventType.view,
        timestamp=NOW,
    )
    assert other.request_id != event.request_id

    wire_payload = {
        "user_id": "user-001",
        "item_id": "ele-001",
        "event_type": "view",
        "timestamp": NOW.isoformat(),
    }
    from_dict = EventIn.model_validate(wire_payload)
    assert HEX32.fullmatch(from_dict.request_id)
    assert from_dict.request_id != event.request_id

    from_json = EventIn.model_validate_json(json.dumps(wire_payload))
    assert HEX32.fullmatch(from_json.request_id)
    assert from_json.request_id not in (event.request_id, from_dict.request_id)


def test_user_and_item_minimal_shapes() -> None:
    """UserIn/ItemIn accept their required fields and default everything else."""
    user = UserIn(user_id="user-001")
    assert user.model_dump() == {
        "user_id": "user-001",
        "gender": None,
        "age_group": None,
        "country": None,
    }
    full = UserIn(user_id="user-002", gender="f", age_group="25-34", country="DE")
    assert UserIn.model_validate(full.model_dump()) == full
    with pytest.raises(ValidationError):
        UserIn()

    item = ItemIn(item_id="ele-001", title="Volt Electronics One", price_cents=1000)
    assert item.available is True
    assert item.brand_id is None
    assert item.image_url is None
    assert item.category_path is None
    assert item.model_dump() == {
        "item_id": "ele-001",
        "title": "Volt Electronics One",
        "brand_id": None,
        "category_path": None,
        "price_cents": 1000,
        "image_url": None,
        "available": True,
    }

    # A single category string is coerced to a one-element path.
    coerced = ItemIn(
        item_id="boo-001", title="Papr Books One", price_cents=1500, category_path="books"
    )
    assert coerced.category_path == ["books"]
    listed = ItemIn(
        item_id="boo-001",
        title="Papr Books One",
        price_cents=1500,
        category_path=["books", "fiction"],
    )
    assert listed.category_path == ["books", "fiction"]

    with pytest.raises(ValidationError):
        ItemIn(item_id="ele-001", price_cents=1000)  # title is required
    with pytest.raises(ValidationError):
        ItemIn(title="No id", price_cents=1000)  # item_id is required
    with pytest.raises(ValidationError):
        ItemIn(item_id="ele-001", title="No price")  # price_cents is required


def test_strategy_enum_members() -> None:
    """Strategy is a closed str enum with the four serving strategies."""
    assert [member.value for member in Strategy] == [
        "als_hybrid",
        "trending",
        "content",
        "degraded",
    ]
    assert {member.value for member in Strategy} == {
        "als_hybrid",
        "trending",
        "content",
        "degraded",
    }
    assert len(Strategy) == 4

    assert Strategy("degraded") is Strategy.degraded
    assert Strategy.als_hybrid == "als_hybrid"
    assert isinstance(Strategy.trending, str)
    json_ready = RecResponse(
        recommendations=[],
        cold_start=False,
        strategy=Strategy.als_hybrid,
        model_version="v1",
    ).model_dump(mode="json")
    assert json_ready["strategy"] == "als_hybrid"
    assert json.loads(
        RecResponse(
            recommendations=[],
            cold_start=False,
            strategy=Strategy.als_hybrid,
            model_version="v1",
        ).model_dump_json()
    )["strategy"] == "als_hybrid"

    for bad in ("cold_start", "ALS_HYBRID", "", None, 0):
        with pytest.raises(ValueError):
            Strategy(bad)


def test_uuid4_hex_helper() -> None:
    """uuid4_hex returns distinct 32-char lowercase hex uuid4 strings."""
    values = {uuid4_hex() for _ in range(64)}
    assert len(values) == 64

    for value in values:
        assert isinstance(value, str)
        assert len(value) == 32
        assert HEX32.fullmatch(value)
        assert value == value.lower()
        assert int(value, 16) >= 0
        parsed = uuid.UUID(hex=value)
        assert parsed.version == 4
        assert parsed.hex == value


def test_rec_response_shape_and_similar_has_no_cold_start() -> None:
    """RecResponse carries cold_start; SimilarResponse intentionally does not."""
    rec = RecResponse(
        recommendations=[
            {"item_id": "ele-001", "score": 1.5, "reason": "similar"},
            {"item_id": "ele-002", "score": 0.75},
        ],
        cold_start=False,
        strategy=Strategy.als_hybrid,
        model_version="v1",
    )
    assert set(RecResponse.model_fields) == {
        "recommendations",
        "cold_start",
        "strategy",
        "model_version",
    }
    assert all(isinstance(item, ScoredItem) for item in rec.recommendations)
    assert rec.recommendations[0].reason == "similar"
    assert rec.recommendations[1].reason is None
    assert rec.model_dump() == {
        "recommendations": [
            {"item_id": "ele-001", "score": 1.5, "reason": "similar"},
            {"item_id": "ele-002", "score": 0.75, "reason": None},
        ],
        "cold_start": False,
        "strategy": Strategy.als_hybrid,
        "model_version": "v1",
    }

    # cold_start, strategy and model_version are all required.
    for missing in ("cold_start", "strategy", "model_version"):
        payload = rec.model_dump()
        payload.pop(missing)
        with pytest.raises(ValidationError):
            RecResponse.model_validate(payload)

    # A cold-start response is still shape-valid.
    cold = RecResponse(
        recommendations=[],
        cold_start=True,
        strategy=Strategy.trending,
        model_version="v1",
    )
    assert cold.cold_start is True
    assert cold.recommendations == []

    # SimilarResponse: no cold_start field at all, and it cannot be set.
    assert set(SimilarResponse.model_fields) == {"items", "model_version", "strategy"}
    assert "cold_start" not in SimilarResponse.model_fields

    similar = SimilarResponse(
        items=[ScoredItem(item_id="boo-001", score=0.25)],
        model_version="v1",
        strategy=Strategy.content,
    )
    assert similar.items[0].item_id == "boo-001"
    assert similar.model_dump() == {
        "items": [{"item_id": "boo-001", "score": 0.25, "reason": None}],
        "model_version": "v1",
        "strategy": Strategy.content,
    }

    # Passing cold_start is ignored, never echoed back.
    ignored = SimilarResponse(
        items=[], model_version="v1", strategy=Strategy.content, cold_start=True
    )
    assert "cold_start" not in ignored.model_dump()

    for missing in ("items", "model_version", "strategy"):
        payload = similar.model_dump()
        payload.pop(missing)
        with pytest.raises(ValidationError):
            SimilarResponse.model_validate(payload)
