"""Phase-2 contract tests using bigint-style IDs represented as strings."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from recommendation.app import baseline, consumer, main, ranker, train_als
from recommendation.app.interaction_data import INTERACTION_COLUMNS
from recommendation.app.schemas import EventIn, EventType, EventValue

NOW = datetime(2026, 10, 20, 10, 0, tzinfo=timezone.utc)
REAL_IDS = {str(value) for value in range(10, 18)}


def _catalog() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "item_id": str(item_id),
                "title": f"Sản phẩm thật {item_id}",
                "brand_id": None,
                "category_path": ["Điện tử" if item_id < 14 else "Gia dụng"],
                "price_cents": item_id * 10000,
                "image_url": None,
                "available": item_id != 17,
            }
            for item_id in range(10, 18)
        ]
    )


def _event(
    request_id: str,
    user_id: str,
    item_id: str,
    event_type: EventType = EventType.view,
) -> EventIn:
    value = (
        EventValue(quantity=2, unit_price_cents=125000, currency="VND")
        if event_type is EventType.purchase
        else None
    )
    return EventIn(
        request_id=request_id,
        user_id=user_id,
        item_id=item_id,
        event_type=event_type,
        timestamp=NOW,
        value=value,
    )


def _real_events() -> pd.DataFrame:
    events = [
        _event("r-1", "15", "10", EventType.view),
        _event("r-2", "15", "11", EventType.cart),
        _event("r-3", "15", "12", EventType.wishlist),
        _event("r-4", "15", "13", EventType.purchase),
        _event("r-5", "15", "14", EventType.view),
        _event("r-6", "27", "10", EventType.purchase),
        _event("r-7", "27", "15", EventType.cart),
        _event("r-8", "27", "16", EventType.wishlist),
    ]
    return pd.DataFrame([consumer.event_to_row(event) for event in events])


def test_api_accepts_real_customer_and_product_ids(
    client: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    published: list[EventIn] = []
    monkeypatch.setattr(main.bus, "publish_event", published.append)

    response = client.post(
        "/events",
        json={
            "request_id": "real-15-42-view",
            "user_id": "15",
            "item_id": "42",
            "event_type": "view",
            "timestamp": NOW.isoformat(),
        },
    )

    assert response.status_code == 202
    assert published[0].user_id == "15"
    assert published[0].item_id == "42"
    assert isinstance(published[0].user_id, str)
    assert isinstance(published[0].item_id, str)


def test_consumer_persists_real_ids_and_purchase_value(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    incoming = tmp_path / "incoming"
    interactions = tmp_path / "interactions.parquet"
    lock = tmp_path / ".merge.lock"
    purchase = _event("purchase-15-42", "15", "42", EventType.purchase)
    monkeypatch.setattr(consumer, "update_redis_counts", lambda _event: None)
    invalidated: list[set[str]] = []
    monkeypatch.setattr(
        consumer,
        "invalidate_interaction_caches",
        lambda user_ids: invalidated.append(set(user_ids)),
    )

    stats = consumer.process_batch(
        [purchase.model_dump(mode="json")],
        incoming_dir=incoming,
        interactions_path=interactions,
        lock_path=lock,
    )

    assert stats["valid"] == 1
    frame = pd.read_parquet(interactions)
    assert list(frame.columns) == INTERACTION_COLUMNS
    assert frame.iloc[0]["user_id"] == "15"
    assert frame.iloc[0]["item_id"] == "42"
    assert frame.iloc[0]["quantity"] == 2
    assert frame.iloc[0]["unit_price_cents"] == 125000
    assert frame.iloc[0]["currency"] == "VND"
    assert invalidated == [{"15"}]


def test_missing_interactions_is_empty_and_cold_start_still_serves(
    write_parquet: Any, tmp_path: Path
) -> None:
    data_dir = Path(write_parquet(items=_catalog(), events=_real_events()))
    missing = data_dir / "missing-interactions.parquet"
    baseline._INTERACTIONS_PARQUET = missing
    ranker._INTERACTIONS_PARQUET = missing
    baseline._load_interactions.cache_clear()
    ranker.invalidate_frame_cache()

    assert list(baseline._load_interactions().columns) == INTERACTION_COLUMNS
    assert baseline._load_interactions().empty
    assert ranker._load_interactions_df().empty
    result = ranker.rank("999", count=4)
    assert result["cold_start"] is True
    assert result["recommendations"]
    assert {row["item_id"] for row in result["recommendations"]} <= REAL_IDS


def test_trending_content_and_similar_endpoint_use_only_real_available_ids(
    client: Any, write_parquet: Any, fake_redis: Any
) -> None:
    write_parquet(items=_catalog(), events=_real_events(), version="real-v4")

    trending_ids = {row["item_id"] for row in baseline.trending(20, now=NOW)}
    content_ids = {row["item_id"] for row in baseline.content_similar("10", 20)}
    response = client.get("/similar/10?count=6")
    similar_ids = {row["item_id"] for row in response.json()["items"]}

    assert response.status_code == 200
    assert trending_ids <= REAL_IDS
    assert content_ids <= REAL_IDS
    assert similar_ids <= REAL_IDS
    assert "17" not in trending_ids | content_ids | similar_ids
    assert not any("-" in item_id for item_id in trending_ids | content_ids | similar_ids)


def test_real_id_als_mappings_and_known_unknown_serving(
    write_parquet: Any, models_dir: Path
) -> None:
    write_parquet(items=_catalog(), events=_real_events(), version="v4")
    matrix, user_ids, item_ids, count = train_als.build_user_item_matrix(
        _real_events()
    )
    model = train_als.train_model(matrix, factors=4, iterations=2)
    model_dir = train_als.save_model(
        model,
        models_dir / "als_v4",
        user_ids,
        item_ids,
        factors=4,
        seed=train_als.SEED,
        n_interactions=count,
    )
    (models_dir / "current_version.txt").write_text("v4\n", encoding="utf-8")
    train_als.invalidate_model_cache()

    _, mappings = train_als.load_model(model_dir)
    assert mappings["user_ids"] == ["15", "27"]
    assert set(mappings["item_ids"]) <= REAL_IDS
    assert all(isinstance(value, str) for value in mappings["user_ids"])
    assert all(isinstance(value, str) for value in mappings["item_ids"])

    known = ranker.rank("15", count=5)
    unknown = ranker.rank("999", count=5)
    assert known["cold_start"] is False
    assert known["recommendations"]
    assert not ({"10", "11", "12", "13", "14"} & {row["item_id"] for row in known["recommendations"]})
    assert unknown["cold_start"] is True
    assert unknown["recommendations"]
    for result in (known, unknown):
        assert {row["item_id"] for row in result["recommendations"]} <= REAL_IDS
