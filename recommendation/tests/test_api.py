"""HTTP contract tests for the serving app (todo 11).

Every test drives the REAL :class:`fastapi.testclient.TestClient` over
:data:`recommendation.app.main.app` — no route is re-implemented here, so a
regression in the app breaks these tests rather than being mirrored by them.

What is covered:

- **Personalized serving** — ``GET /recommendations/{user_id}`` for a known
  user (not cold start), for an unknown user (zero history → cold start via
  the popular path), the shared-nothing cache (``X-Cache: MISS`` then
  ``HIT``, never cross-user), and both uncached degradations (dead Redis,
  wrong-shape cache entry).
- **Content serving** — ``GET /similar/{item_id}`` for a known item, for an
  unknown item (never empty, never 404), its cache HIT/MISS pair, and both
  uncached degradations.
- **Ingestion** — ``POST /events`` is 202 for a queued event (echoing the
  caller ``request_id``), 202 + ``queued-buffered`` when the bus raises
  :class:`~recommendation.app.bus.BusUnavailable`, 202 + a real spool line
  when the real bus cannot reach the broker, and 422 for invalid /
  revenue-less bodies.
- **Health** — ``GET /health`` is ``ok`` only when Kafka, Redis and the model
  pointer are all up, ``degraded`` when deps are down or the pointer is
  missing, and reports Kafka as ``down`` when settings loading raises
  :class:`~recommendation.app.config.ConfigError`. Never a 500.
- **Hardening** — hostile ids (``a:b``, SCAN glob chars) get 422, never an
  unhandled 500, on both routes; and the metrics hooks failing never breaks
  serving.

Hermeticity comes from ``tests/conftest.py``: ``write_parquet`` redirects the
parquet/model path globals into ``tmp_path``, ``fake_redis``/``dead_redis``
swap the Redis client, and ``settings_env`` supplies the env vars
``config.load_settings`` requires. ``version_pointer`` additionally points
``main._VERSION_FILE`` at the temp models dir so the reported
``model_version`` is a real fixture value instead of the committed pointer.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from conftest import make_event
from recommendation.app import bus, main
from recommendation.app.config import ConfigError
from recommendation.app.schemas import EventIn, EventType

#: Catalog item ids present in the conftest fixture data.
CATALOG_IDS = {"ele-001", "ele-002", "ele-003", "boo-001", "boo-002", "boo-003"}

# --------------------------------------------------------------------------
# Local fixtures (names are deliberately distinct from conftest's so the
# recovered node-id list is not perturbed).
# --------------------------------------------------------------------------


@pytest.fixture
def version_pointer(monkeypatch: pytest.MonkeyPatch, models_dir: Path) -> Path:
    """Point ``main._VERSION_FILE`` at the temp models dir.

    ``write_parquet`` moves ``main._MODELS_DIR`` but the version file path is
    frozen at import time, so without this the app would read the committed
    ``recommendation/models/current_version.txt`` instead of the fixture's.
    """
    pointer = models_dir / "current_version.txt"
    monkeypatch.setattr(main, "_VERSION_FILE", pointer)
    return pointer


def _rec_keys(redis: Any) -> list[str]:
    """Return the ``recs:*`` keys currently held by the fake Redis."""
    return sorted(k for k in redis.strings if k.startswith("recs:"))


def _similar_keys(redis: Any) -> list[str]:
    """Return the ``similar:*`` keys currently held by the fake Redis."""
    return sorted(k for k in redis.strings if k.startswith("similar:"))


def _recs_keys(redis: Any) -> list[str]:
    """Return the ``recs:*`` keys currently held by the fake Redis."""
    return sorted(k for k in redis.strings if k.startswith("recs:"))


# --------------------------------------------------------------------------
# GET /recommendations/{user_id}
# --------------------------------------------------------------------------


def test_get_recommendations_known_user(
    client: Any, write_parquet: Any, version_pointer: Path, fake_redis: Any
) -> None:
    """A user with 6 interactions gets personalised, non-cold-start recs."""
    write_parquet()

    response = client.get("/recommendations/user-001?count=5")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "recommendations",
        "cold_start",
        "strategy",
        "model_version",
    }
    assert body["cold_start"] is False
    assert body["model_version"] == "v1"
    assert body["strategy"] in {
        "als_hybrid",
        "trending",
        "content",
        "degraded",
    }
    assert 1 <= len(body["recommendations"]) <= 5
    for entry in body["recommendations"]:
        assert set(entry) == {"item_id", "score", "reason"}
        assert isinstance(entry["item_id"], str) and entry["item_id"]
        assert isinstance(entry["score"], float)


def test_get_recommendations_unknown_user_falls_back_to_popular(
    client: Any, write_parquet: Any, version_pointer: Path, fake_redis: Any
) -> None:
    """A zero-history user is cold start and still gets a non-empty page."""
    write_parquet()

    response = client.get("/recommendations/user-999?count=4")

    assert response.status_code == 200
    body = response.json()
    assert body["cold_start"] is True
    assert body["strategy"] in {"trending", "content", "degraded"}
    assert body["recommendations"], "cold-start fallback must never be empty"
    assert len(body["recommendations"]) <= 4
    # Popular fallback only ever serves catalog items.
    catalog = {"ele-001", "ele-002", "ele-003", "boo-001", "boo-002", "boo-003"}
    assert {r["item_id"] for r in body["recommendations"]} <= catalog


def test_recommendations_degrade_uncached_when_redis_down(
    client: Any, write_parquet: Any, version_pointer: Path, dead_redis: Any
) -> None:
    """A dead Redis serves an uncached 200 instead of failing the request."""
    write_parquet()

    response = client.get("/recommendations/user-002?count=3")

    assert response.status_code == 200
    assert response.headers["X-Cache"] == "MISS"
    body = response.json()
    assert body["recommendations"]
    assert body["cold_start"] is True


def test_recommendations_wrong_shape_entry_recomputed(
    client: Any, write_parquet: Any, version_pointer: Path, fake_redis: Any
) -> None:
    """A cache envelope whose ``data`` has the wrong shape is recomputed."""
    write_parquet()

    warm = client.get("/recommendations/user-002?count=3")
    assert warm.status_code == 200
    assert warm.headers["X-Cache"] == "MISS"
    keys = _rec_keys(fake_redis)
    assert len(keys) == 1

    bad = json.dumps(
        {"data": {"totally": "wrong shape"}, "generatedAt": "2026-09-20T12:00:00+00:00"}
    )
    fake_redis.set(keys[0], bad)

    response = client.get("/recommendations/user-002?count=3")

    assert response.status_code == 200
    assert response.headers["X-Cache"] == "MISS"
    body = response.json()
    assert "totally" not in body
    assert set(body) == {
        "recommendations",
        "cold_start",
        "strategy",
        "model_version",
    }
    assert body["recommendations"]


def test_no_cross_user_cache(
    client: Any, write_parquet: Any, version_pointer: Path, fake_redis: Any
) -> None:
    """Two users with identical context get two distinct keys and payloads."""
    write_parquet()

    first = client.get("/recommendations/user-001?context=homepage&count=5")
    second = client.get("/recommendations/user-002?context=homepage&count=5")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.headers["X-Cache"] == "MISS"
    assert second.headers["X-Cache"] == "MISS"

    keys = _rec_keys(fake_redis)
    assert len(keys) == 2, f"expected one personalized key per user, got {keys}"
    assert keys[0] != keys[1]
    assert "user-001" in keys[0]
    assert "user-002" in keys[1]

    assert first.json() != second.json(), "user A's payload was served to user B"


# --------------------------------------------------------------------------
# GET /similar/{item_id}
# --------------------------------------------------------------------------


def test_get_similar_known_item(
    client: Any, write_parquet: Any, version_pointer: Path, fake_redis: Any
) -> None:
    """A catalog item returns content neighbours, never itself."""
    write_parquet()

    response = client.get("/similar/ele-001?count=3")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"items", "strategy", "model_version"}
    assert "cold_start" not in body
    assert body["strategy"] == "content"
    assert body["model_version"] == "v1"
    assert body["items"], "a known item must always have neighbours"
    assert "ele-001" not in {row["item_id"] for row in body["items"]}
    for row in body["items"]:
        assert set(row) == {"item_id", "score", "reason"}
        assert row["reason"] == "content_similar"
        assert 0.0 <= row["score"] <= 1.0


def test_get_similar_unknown_item_never_empty(
    client: Any, write_parquet: Any, version_pointer: Path, fake_redis: Any
) -> None:
    """An unknown item degrades to trending: 200, non-empty, never a 404."""
    write_parquet()

    response = client.get("/similar/no-such-item-999?count=3")

    assert response.status_code == 200
    body = response.json()
    assert body["items"], "unknown item must fall back, never return empty"
    assert len(body["items"]) <= 3
    assert {row["item_id"] for row in body["items"]} <= CATALOG_IDS


def test_get_similar_hit_on_second_call(
    client: Any, write_parquet: Any, version_pointer: Path, fake_redis: Any
) -> None:
    """The shareable similar cache is a MISS then a HIT on the same key."""
    write_parquet()

    first = client.get("/similar/ele-001?count=3")
    second = client.get("/similar/ele-001?count=3")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.headers["X-Cache"] == "MISS"
    assert second.headers["X-Cache"] == "HIT"
    assert first.json() == second.json()
    # `count` is part of the key, so a 3-item list is never served to a
    # caller who asked for a different size.
    assert _similar_keys(fake_redis) == ["similar:ele-001:3"]


def test_similar_cache_key_varies_with_count(
    client: Any, write_parquet: Any, fake_redis: Any
) -> None:
    """Different `count` values must not share one cache entry."""
    write_parquet()

    small = client.get("/similar/ele-001?count=2")
    large = client.get("/similar/ele-001?count=4")

    assert small.status_code == 200
    assert large.status_code == 200
    assert large.headers["X-Cache"] == "MISS"
    assert len(small.json()["items"]) == 2
    assert len(large.json()["items"]) == 4
    assert set(_similar_keys(fake_redis)) == {"similar:ele-001:2", "similar:ele-001:4"}


def test_recommendations_cache_key_varies_with_count(
    client: Any, write_parquet: Any, fake_redis: Any
) -> None:
    """A cached short rail must not be served to a caller wanting more."""
    write_parquet()

    small = client.get("/recommendations/user-001?count=2")
    large = client.get("/recommendations/user-001?count=5")

    assert small.status_code == 200
    assert large.status_code == 200
    assert small.headers["X-Cache"] == "MISS"
    # A different count is a different key, so this cannot be a HIT.
    assert large.headers["X-Cache"] == "MISS"
    assert set(_recs_keys(fake_redis)) == {
        "recs:user-001:homepage::v1:2",
        "recs:user-001:homepage::v1:5",
    }


def test_get_similar_degrades_uncached_when_redis_down(
    client: Any, write_parquet: Any, version_pointer: Path, dead_redis: Any
) -> None:
    """A dead Redis serves an uncached 200 instead of failing the request."""
    write_parquet()

    response = client.get("/similar/ele-001?count=3")

    assert response.status_code == 200
    assert response.headers["X-Cache"] == "MISS"
    body = response.json()
    assert body["items"]
    assert body["strategy"] == "content"


def test_similar_wrong_shape_entry_recomputed(
    client: Any, write_parquet: Any, version_pointer: Path, fake_redis: Any
) -> None:
    """A cache envelope whose ``data`` has the wrong shape is recomputed."""
    write_parquet()

    warm = client.get("/similar/ele-001?count=3")
    assert warm.status_code == 200
    assert warm.headers["X-Cache"] == "MISS"
    keys = _similar_keys(fake_redis)
    assert len(keys) == 1

    bad = json.dumps(
        {"data": ["not", "a", "payload"], "generatedAt": "2026-09-20T12:00:00+00:00"}
    )
    fake_redis.set(keys[0], bad)

    response = client.get("/similar/ele-001?count=3")

    assert response.status_code == 200
    assert response.headers["X-Cache"] == "MISS"
    body = response.json()
    assert set(body) == {"items", "strategy", "model_version"}
    assert body["strategy"] == "content"
    assert body["items"]
    assert [row["item_id"] for row in body["items"]] == [
        row["item_id"] for row in warm.json()["items"]
    ]


# --------------------------------------------------------------------------
# GET /health
# --------------------------------------------------------------------------


def test_health_ok_when_all_deps_up(
    client: Any,
    write_parquet: Any,
    version_pointer: Path,
    fake_redis: Any,
    settings_env: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Kafka up + Redis PING + a model pointer → ``status == "ok"``."""
    write_parquet()
    monkeypatch.setattr(main, "_kafka_status", lambda: "up")

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"status", "kafka", "redis", "model_version"}
    assert body["kafka"] == "up"
    assert body["redis"] == "up"
    assert body["model_version"] == "v1"
    assert body["status"] == "ok"


def test_health_degraded_when_deps_down(
    client: Any,
    write_parquet: Any,
    version_pointer: Path,
    dead_redis: Any,
    settings_env: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Both dependencies down → 200 with ``degraded`` (never a 500)."""
    write_parquet()
    monkeypatch.setattr(main, "_kafka_status", lambda: "down")

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["kafka"] == "down"
    assert body["redis"] == "down"
    assert body["status"] == "degraded"
    assert body["model_version"] == "v1"


def test_health_kafka_config_error_is_down(
    client: Any,
    write_parquet: Any,
    version_pointer: Path,
    fake_redis: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A :class:`ConfigError` from ``load_settings`` reports Kafka ``down``."""
    import recommendation.app.config as config_mod

    write_parquet()

    def _raise() -> Any:
        raise ConfigError("Missing required environment variable: KAFKA_BOOTSTRAP")

    monkeypatch.setattr(config_mod, "load_settings", _raise)

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["kafka"] == "down"
    assert body["redis"] == "up"
    assert body["status"] == "degraded"


def test_health_missing_version_pointer_is_none(
    client: Any,
    write_parquet: Any,
    version_pointer: Path,
    fake_redis: Any,
    settings_env: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No pointer file → ``model_version == "none"`` and ``degraded``."""
    write_parquet(version=None)
    assert not version_pointer.exists()
    monkeypatch.setattr(main, "_kafka_status", lambda: "up")

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["model_version"] == "none"
    assert body["kafka"] == "up"
    assert body["redis"] == "up"
    assert body["status"] == "degraded"


# --------------------------------------------------------------------------
# POST /events
# --------------------------------------------------------------------------


def test_post_event_pure_queued_echoes_request_id(
    client: Any, version_pointer: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A published event is 202 ``queued`` and echoes the caller's id."""
    event = make_event("user-001", "ele-001", EventType.view, request_id="req-abc-1")
    monkeypatch.setattr(bus, "publish_event", lambda e: object())

    response = client.post("/events", json=json.loads(event.model_dump_json()))

    assert response.status_code == 202
    body = response.json()
    assert set(body) == {"status", "request_id"}
    assert body["status"] == "queued"
    assert body["request_id"] == "req-abc-1"


def test_post_event_bus_down_still_202_buffered(
    client: Any, version_pointer: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """:class:`BusUnavailable` maps to 202 ``queued-buffered``, never a 500."""

    def _unavailable(event: EventIn) -> Any:
        raise bus.BusUnavailable("Kafka unavailable")

    monkeypatch.setattr(bus, "publish_event", _unavailable)
    event = make_event("user-002", "boo-002", EventType.click, request_id="req-bus-2")

    response = client.post("/events", json=json.loads(event.model_dump_json()))

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "queued-buffered"
    assert body["request_id"] == "req-bus-2"


def test_post_event_real_bus_spools_buffered_when_broker_down(
    client: Any,
    version_pointer: Path,
    settings_env: dict[str, str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The REAL bus spools to disk and the route still answers 202."""
    spool = tmp_path / "spool" / "local_buffer.jsonl"
    monkeypatch.setenv("LOCAL_BUFFER_PATH", str(spool))

    def _no_broker(*args: Any, **kwargs: Any) -> Any:
        raise ConnectionError("no broker reachable")

    monkeypatch.setattr(bus, "get_producer", _no_broker)

    event = make_event("user-003", "ele-003", EventType.view, request_id="req-spool-3")
    response = client.post("/events", json=json.loads(event.model_dump_json()))

    assert response.status_code == 202
    assert response.json()["status"] == "queued-buffered"
    assert response.json()["request_id"] == "req-spool-3"

    assert spool.exists(), "broker-down event must be spooled, never dropped"
    lines = [ln for ln in spool.read_text(encoding="utf-8").splitlines() if ln.strip()]
    assert len(lines) == 1
    assert json.loads(lines[0])["request_id"] == "req-spool-3"
    assert bus.get_bus_publish_failures() == 1


def test_post_event_invalid_body_is_422(
    client: Any, version_pointer: Path
) -> None:
    """A body missing ``item_id`` is rejected by validation, not a 500."""
    payload = {
        "request_id": "req-invalid-1",
        "user_id": "user-001",
        "event_type": "view",
        "timestamp": "2026-09-19T12:00:00+00:00",
    }

    response = client.post("/events", json=payload)

    assert response.status_code == 422
    assert "item_id" in response.text


def test_post_event_purchase_without_revenue_is_422(
    client: Any, version_pointer: Path
) -> None:
    """A purchase with no revenue value is rejected by the model validator."""
    payload = {
        "request_id": "req-invalid-2",
        "user_id": "user-001",
        "item_id": "ele-001",
        "event_type": "purchase",
        "timestamp": "2026-09-19T12:00:00+00:00",
    }

    response = client.post("/events", json=payload)

    assert response.status_code == 422
    assert "purchase" in response.text.lower()


# --------------------------------------------------------------------------
# Hardening
# --------------------------------------------------------------------------


@pytest.mark.parametrize("hostile", ["a:b", "item-*"], ids=["a:b", "item-*"])
def test_hostile_item_id_never_500(
    client: Any, write_parquet: Any, version_pointer: Path, fake_redis: Any,
    hostile: str,
) -> None:
    """A hostile item id is 422, never an unhandled 500."""
    write_parquet()

    response = client.get(f"/similar/{hostile}")

    assert response.status_code != 500
    assert response.status_code == 422


@pytest.mark.parametrize("hostile", ["a:b", "user-*"], ids=["a:b", "user-*"])
def test_hostile_user_id_never_500(
    client: Any, write_parquet: Any, version_pointer: Path, fake_redis: Any,
    hostile: str,
) -> None:
    """A hostile user id is 422, never an unhandled 500."""
    write_parquet()

    response = client.get(f"/recommendations/{hostile}")

    assert response.status_code != 500
    assert response.status_code == 422


@pytest.mark.parametrize(
    "url",
    ["/recommendations/user-001?count=5", "/similar/item-001?count=5"],
    ids=["/recommendations/user-001?count=5", "/similar/item-001?count=5"],
)
def test_routes_survive_metrics_hook_failures(
    client: Any,
    write_parquet: Any,
    version_pointer: Path,
    fake_redis: Any,
    url: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Metrics/impression hooks blowing up never breaks serving."""
    write_parquet()

    def _boom(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("metrics hook exploded")

    monkeypatch.setattr(main, "_observe_request", _boom)
    monkeypatch.setattr(main, "_log_impression", _boom)

    response = client.get(url)

    assert response.status_code == 200
    assert response.json()


def test_recommendations_ignore_the_live_model_pointer(
    client: Any,
    write_parquet: Any,
    version_pointer: Path,
    fake_redis: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The served pointer comes from the redirected models dir, not the live one.

    A stale ``main._VERSION_FILE`` module constant made these tests read the real
    ``models/current_version.txt``, so any ``train.py --version`` turned the suite
    red. ``_VERSION_FILE`` is pointed at a nonexistent path here, so any code
    still reading it gets ``"none"`` and the assertions below fail.
    """
    write_parquet(version="v-test")
    assert version_pointer.read_text(encoding="utf-8").strip() == "v-test"

    monkeypatch.setattr(main, "_VERSION_FILE", version_pointer / "does-not-exist")

    assert main.current_model_version() == "v-test"

    client.get("/recommendations/user-001?count=2")
    assert any(key.endswith("::v-test:2") for key in _rec_keys(fake_redis))
    assert all("::none:" not in key for key in _rec_keys(fake_redis))
