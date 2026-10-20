"""Focused tests for atomic real-product catalog synchronization."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from recommendation.app import baseline, catalog, ranker, store


def _item(item_id: str = "123", *, available: bool = True) -> dict[str, Any]:
    return {
        "item_id": item_id,
        "title": "Tai nghe Sony",
        "brand_id": None,
        "category_path": ["Điện tử"],
        "price_cents": 890000,
        "image_url": "https://example.com/sony.jpg",
        "available": available,
    }


def _redirect_catalog(monkeypatch: pytest.MonkeyPatch, path: Path) -> None:
    monkeypatch.setattr(catalog, "ITEMS_PARQUET", path)
    monkeypatch.setattr(baseline, "_ITEMS_PARQUET", path)
    monkeypatch.setattr(ranker, "_ITEMS_PARQUET", path)
    baseline._load_items.cache_clear()
    baseline._tfidf_matrix.cache_clear()
    ranker.invalidate_frame_cache()


def test_valid_catalog_request_creates_readable_parquet(
    client: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    fake_redis: Any,
) -> None:
    path = tmp_path / "data" / "items.parquet"
    _redirect_catalog(monkeypatch, path)

    response = client.put("/catalog", json={"items": [_item("123"), _item("987", available=False)]})

    assert response.status_code == 200
    assert response.json()["total_items"] == 2
    assert response.json()["available_items"] == 1
    frame = pd.read_parquet(path)
    assert list(frame.columns) == catalog.CATALOG_COLUMNS
    assert frame["item_id"].tolist() == ["123", "987"]
    assert frame["price_cents"].tolist() == [890000, 890000]
    assert frame["available"].tolist() == [True, False]
    assert list(frame.iloc[0]["category_path"]) == ["Điện tử"]
    assert baseline._load_items()["item_id"].tolist() == ["123", "987"]


def test_duplicate_item_id_is_rejected_without_writing(
    client: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "items.parquet"
    _redirect_catalog(monkeypatch, path)

    response = client.put("/catalog", json={"items": [_item("123"), _item("123")]})

    assert response.status_code == 422
    assert "duplicate item_id" in response.text
    assert not path.exists()


@pytest.mark.parametrize(
    "payload",
    [
        {"items": []},
        {"items": [{**_item(), "price_cents": -1}]},
        {"items": [{**_item(), "item_id": ""}]},
    ],
)
def test_invalid_catalog_schema_is_rejected(
    client: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    payload: dict[str, Any],
) -> None:
    path = tmp_path / "items.parquet"
    _redirect_catalog(monkeypatch, path)

    response = client.put("/catalog", json=payload)

    assert response.status_code == 422
    assert not path.exists()


def test_failed_candidate_write_preserves_previous_catalog(
    client: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    fake_redis: Any,
) -> None:
    path = tmp_path / "items.parquet"
    old = pd.DataFrame([_item("111")])
    old.to_parquet(path, index=False)
    old_bytes = path.read_bytes()
    _redirect_catalog(monkeypatch, path)

    def fail_write(_frame: pd.DataFrame, _path: Path) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(catalog, "_write_parquet", fail_write)
    response = client.put("/catalog", json={"items": [_item("222")]})

    assert response.status_code == 500
    assert path.read_bytes() == old_bytes
    assert pd.read_parquet(path)["item_id"].tolist() == ["111"]


def test_successful_sync_refreshes_local_and_redis_catalog_state(
    client: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    fake_redis: Any,
) -> None:
    path = tmp_path / "items.parquet"
    pd.DataFrame([_item("111")]).to_parquet(path, index=False)
    _redirect_catalog(monkeypatch, path)
    assert baseline._load_items()["item_id"].tolist() == ["111"]
    assert ranker._load_items_df()["item_id"].tolist() == ["111"]

    recs_key = store.recs_key("customer-1", "homepage", "", "v3")
    similar_key = store.similar_key("111")
    popular_key = store.popular_key(1)
    session_key = store.session_key("session-1")
    for key in (recs_key, similar_key, popular_key):
        store.cache_set(key, {"items": ["111"]})
    store.session_set("session-1", {"last_item": "111"})

    response = client.put("/catalog", json={"items": [_item("222")]})

    assert response.status_code == 200
    assert baseline._load_items()["item_id"].tolist() == ["222"]
    assert ranker._load_items_df()["item_id"].tolist() == ["222"]
    assert store.cache_get(recs_key) is None
    assert store.cache_get(similar_key) is None
    assert store.cache_get(popular_key) is None
    assert fake_redis.hgetall(session_key) == {"last_item": "111"}
