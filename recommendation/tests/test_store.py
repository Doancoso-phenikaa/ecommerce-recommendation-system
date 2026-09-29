"""Tests for the Redis cache layer (``app/store.py``).

Covers the key scheme (personalized keys always embed their owner, similar
keys carry no ``model_version``), the ``recs:*`` TTL clamp, envelope shape
and freshness, session hashes, SCAN-based invalidation, cross-user
isolation, and the :class:`CacheUnavailable` mapping for a dead Redis.

Redis is always the conftest ``fake_redis``/``dead_redis`` stub — never a
real server.
"""

from __future__ import annotations

import inspect
import json
import time
from datetime import datetime, timezone
from typing import Any

import pytest

from recommendation.app import store


def _remaining(client: Any, key: str, now: float) -> float:
    return client.expiry[key] - now


def _default_count(builder: Any) -> int:
    return int(inspect.signature(builder).parameters["count"].default)


def test_cache_miss_returns_none(fake_redis: Any) -> None:
    """Missing, corrupt and non-dict payloads are all misses — never exceptions."""
    key = store.recs_key("user-404", "home", "all", "v1")
    assert store.cache_get(key) is None

    store.cache_set(key, {"items": ["ele-001"]})
    assert store.cache_get(key) is not None

    fake_redis.set(key, "not-json{")
    assert store.cache_get(key) is None

    fake_redis.set(key, json.dumps([1, 2, 3]))
    assert store.cache_get(key) is None

    fake_redis.set(key, json.dumps({"generatedAt": "2026-09-20T12:00:00+00:00"}))
    assert store.cache_get(key) is None

    fake_redis.set(key, json.dumps("a bare string"))
    assert store.cache_get(key) is None

    store.cache_set(key, {"items": ["ele-001"]})
    fake_redis.expiry[key] = time.time() - 1
    assert store.cache_get(key) is None


def test_get_redis_uses_settings_url_with_2s_timeout(
    monkeypatch: pytest.MonkeyPatch, settings_env: dict[str, str]
) -> None:
    """The client is built from settings.redis_url with 2s socket timeouts."""
    captured: dict[str, Any] = {}

    def fake_from_url(url: str, **kwargs: Any) -> object:
        captured["url"] = url
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(store.redis.Redis, "from_url", fake_from_url)
    store.reset_client()

    client = store.get_redis()
    assert captured["url"] == settings_env["REDIS_URL"] == "redis://localhost:6379/0"
    assert captured["kwargs"]["decode_responses"] is True
    assert store._SOCKET_TIMEOUT_S == 2.0
    assert captured["kwargs"]["socket_connect_timeout"] == 2.0
    assert captured["kwargs"]["socket_timeout"] == 2.0

    # URL-keyed singleton: an unchanged URL reuses the client without rebuilding.
    assert store.get_redis() is client
    assert captured["url"] == "redis://localhost:6379/0"

    # A changed URL rebuilds the client.
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6380/1")
    rebuilt = store.get_redis()
    assert rebuilt is not client
    assert captured["url"] == "redis://localhost:6380/1"

    store.reset_client()
    assert store.get_redis() is not rebuilt
    assert captured["url"] == "redis://localhost:6380/1"


def test_recs_key_requires_user_id() -> None:
    """``user_id`` is mandatory and must be a plain, colon-free segment."""
    count = _default_count(store.recs_key)
    key = store.recs_key("user-001", "ctx-1", "flt-1", "v1")
    assert key == f"recs:user-001:ctx-1:flt-1:v1:{count}"
    assert key.split(":")[1:5] == ["user-001", "ctx-1", "flt-1", "v1"]
    assert store.recs_key("user-001") == f"recs:user-001::::{count}"
    assert store.recs_key("user-001", count=count) == store.recs_key("user-001")
    assert store.recs_key("user-001", count=1) != store.recs_key("user-001")

    for bad in ("", ":", None, 0):
        with pytest.raises(ValueError):
            store.recs_key(bad)

    with pytest.raises(TypeError):
        store.recs_key()

    with pytest.raises(TypeError):
        store.recs_key(context="ctx", filter="flt", model_version="v1")

    for meta in ("user-001*", "user-001?", "user-[001]", "user-001\n", "user-001\r", "user-001\\x"):
        with pytest.raises(ValueError):
            store.recs_key(meta)

    with pytest.raises(ValueError):
        store.recs_key("user:001")


def test_recs_ttl_clamped_to_bounds(fake_redis: Any) -> None:
    """``recs:*`` TTLs clamp to [60, 300]; other prefixes are not clamped."""
    assert (store.RECS_TTL_MIN_S, store.RECS_TTL_DEFAULT_S, store.RECS_TTL_MAX_S) == (
        60,
        120,
        300,
    )
    now = time.time()
    key = store.recs_key("user-001", "home", "all", "v1")

    store.cache_set(key, {"items": []}, ttl=1)
    assert _remaining(fake_redis, key, now) == pytest.approx(store.RECS_TTL_MIN_S, abs=2)

    store.cache_set(key, {"items": []}, ttl=10_000)
    assert _remaining(fake_redis, key, now) == pytest.approx(store.RECS_TTL_MAX_S, abs=2)

    store.cache_set(key, {"items": []}, ttl=200)
    assert _remaining(fake_redis, key, now) == pytest.approx(200, abs=2)

    store.cache_set(key, {"items": []})
    assert _remaining(fake_redis, key, now) == pytest.approx(
        store.RECS_TTL_DEFAULT_S, abs=2
    )

    store.cache_set(key, {"items": []}, ttl=0)
    assert _remaining(fake_redis, key, now) == pytest.approx(store.RECS_TTL_MIN_S, abs=2)

    store.cache_set(key, {"items": []}, ttl=-5)
    assert _remaining(fake_redis, key, now) == pytest.approx(store.RECS_TTL_MIN_S, abs=2)

    similar = store.similar_key("ele-001")
    store.cache_set(similar, {"items": []}, ttl=5)
    assert _remaining(fake_redis, similar, now) == pytest.approx(5, abs=2)

    store.cache_set(similar, {"items": []})
    assert _remaining(fake_redis, similar, now) == pytest.approx(
        store.SIMILAR_TTL_S, abs=2
    )

    popular = store.popular_key(2)
    store.cache_set(popular, {"items": []}, ttl=30)
    assert _remaining(fake_redis, popular, now) == pytest.approx(30, abs=2)

    store.cache_set(popular, {"items": []})
    assert _remaining(fake_redis, popular, now) == pytest.approx(
        store.POPULAR_TTL_S, abs=2
    )

    with pytest.raises(ValueError):
        store.cache_set(store.similar_key("ele-002"), {"items": []}, ttl=0)


def test_set_get_hit_with_generated_at(fake_redis: Any) -> None:
    """A hit returns the ``{"data", "generatedAt"}`` envelope, stored as JSON."""
    key = store.recs_key("user-001", "home", "in-stock", "v1")
    assert store.cache_get(key) is None

    payload = {"items": [{"item_id": "ele-001", "score": 0.5}]}
    before = datetime.now(timezone.utc)
    store.cache_set(key, payload)
    after = datetime.now(timezone.utc)

    envelope = store.cache_get(key)
    assert envelope is not None
    assert set(envelope) == {"data", "generatedAt"}
    assert envelope["data"] == payload

    generated_at = datetime.fromisoformat(envelope["generatedAt"])
    assert generated_at.tzinfo is not None
    assert generated_at.utcoffset() == timezone.utc.utcoffset(None)
    assert before <= generated_at <= after

    assert json.loads(fake_redis.strings[key]) == envelope
    assert store.cache_get(key) == envelope

    # Overwriting refreshes the timestamp and the payload.
    time.sleep(0.01)
    store.cache_set(key, {"items": []})
    refreshed = store.cache_get(key)
    assert refreshed is not None
    assert refreshed["data"] == {"items": []}
    assert datetime.fromisoformat(refreshed["generatedAt"]) > generated_at


def test_similar_key_has_no_model_version() -> None:
    """``similar:{item_id}`` is stable across model versions."""
    count = _default_count(store.similar_key)
    key = store.similar_key("ele-001")
    assert key == f"similar:ele-001:{count}"
    assert key.split(":") == ["similar", "ele-001", str(count)]
    assert store.similar_key("ele-001", count=count) == key
    assert store.similar_key("ele-001") == key
    assert "model_version" not in key
    assert "v1" not in key.split(":")
    assert "v2" not in key.split(":")

    assert store.similar_key("ele-001", count=1) == f"similar:ele-001:1"
    assert store.similar_key("boo-002") == f"similar:boo-002:{count}"
    assert store.similar_key("boo-002") != key

    for bad in ("", "ele-001*", "ele-001?", "ele-[001]", "ele-001\n", "ele-001\\x"):
        with pytest.raises(ValueError):
            store.similar_key(bad)

    with pytest.raises(ValueError):
        store.similar_key("ele:001")


def test_invalidate_on_event_clears_only_owner(fake_redis: Any) -> None:
    """SCAN-based invalidation deletes only ``recs:{user_id}:*``."""
    a_home = store.recs_key("user-001", "home", "", "v1")
    a_pdp = store.recs_key("user-001", "pdp", "in-stock", "v2")
    b_home = store.recs_key("user-002", "home", "", "v1")
    lookalike = store.recs_key("user-0012", "home", "", "v1")
    untouched = store.similar_key("ele-001")
    popular = store.popular_key(1)

    for key in (a_home, a_pdp, b_home, lookalike, untouched, popular):
        store.cache_set(key, {"items": ["ele-001"]})

    assert store.invalidate_on_event("user-001") == 2
    assert store.cache_get(a_home) is None
    assert store.cache_get(a_pdp) is None
    assert store.cache_get(b_home) is not None
    assert store.cache_get(lookalike) is not None
    assert store.cache_get(untouched) is not None
    assert store.cache_get(popular) is not None

    assert store.invalidate_on_event("user-001") == 0
    assert store.invalidate_on_event("user-002") == 1
    assert store.cache_get(b_home) is None
    assert store.cache_get(lookalike) is not None
    assert store.cache_get(untouched) is not None

    store.session_set("sess-1", {"last_item": "ele-001"})
    assert store.invalidate_on_event("user-001") == 0
    assert store.session_get("sess-1") == {"last_item": "ele-001"}


def test_invalidate_on_event_empty_is_zero(fake_redis: Any) -> None:
    """Invalidating a user with no personalized entries returns 0."""
    assert store.invalidate_on_event("user-empty") == 0

    mine = store.recs_key("user-001", "home", "", "v1")
    store.cache_set(mine, {"items": []})
    assert store.invalidate_on_event("user-other") == 0
    assert store.cache_get(mine) is not None

    store.cache_set(store.popular_key(1), {"items": []})
    store.session_set("sess-1", {"last_item": "ele-001"})

    assert store.invalidate_on_event("user-001") == 1
    assert store.cache_get(mine) is None
    assert store.cache_get(store.popular_key(1)) is not None
    assert store.session_get("sess-1") == {"last_item": "ele-001"}

    assert store.invalidate_on_event("user-001") == 0


def test_invalidate_rejects_wildcard_user_id(fake_redis: Any) -> None:
    """Glob metacharacters in user_id are rejected before any SCAN runs."""
    for bad in ("user-*", "*", "?", "user-001?", "[a-z]", "a\\b", "user-001\n", "user-001\r", "", "user-001:x"):
        with pytest.raises(ValueError):
            store.invalidate_on_event(bad)

    mine = store.recs_key("user-001", "home", "", "v1")
    store.cache_set(mine, {"items": []})

    with pytest.raises(ValueError):
        store.invalidate_on_event("user-001*")

    assert store.cache_get(mine) is not None
    assert store.invalidate_on_event("user-001") == 1


def test_user_a_key_never_returned_for_user_b(fake_redis: Any) -> None:
    """Personalized and session entries can never be served across owners."""
    a_key = store.recs_key("user-001", "home", "", "v1")
    b_key = store.recs_key("user-002", "home", "", "v1")
    assert a_key != b_key

    store.cache_set(a_key, {"items": ["ele-001"]})
    assert store.cache_get(a_key) is not None
    assert store.cache_get(b_key) is None

    store.cache_set(b_key, {"items": ["boo-001"]})
    assert store.cache_get(a_key)["data"] == {"items": ["ele-001"]}
    assert store.cache_get(b_key)["data"] == {"items": ["boo-001"]}

    assert store.invalidate_on_event("user-001") == 1
    assert store.cache_get(a_key) is None
    assert store.cache_get(b_key) is not None

    store.session_set("sess-a", {"last_item": "ele-001"})
    assert store.session_get("sess-b") is None
    assert store.session_get("sess-a") == {"last_item": "ele-001"}


def test_session_hash_round_trip(fake_redis: Any) -> None:
    """Session hashes round-trip through hset/hgetall and carry SESSION_TTL_S."""
    assert store.session_key("sess-1") == "session:sess-1"
    assert store.session_get("sess-1") is None

    mapping = {"last_item": "ele-001", "viewed": "3"}
    store.session_set("sess-1", mapping)
    assert store.session_get("sess-1") == mapping
    assert store.session_key("sess-1") in fake_redis.hashes
    assert fake_redis.expiry[store.session_key("sess-1")] - time.time() == pytest.approx(
        store.SESSION_TTL_S, abs=2
    )

    store.session_set("sess-1", {"cart_size": "1"})
    assert store.session_get("sess-1") == {**mapping, "cart_size": "1"}

    store.session_set("sess-2", {"a": "b"}, ttl=60)
    assert store.session_get("sess-2") == {"a": "b"}
    assert fake_redis.expiry[store.session_key("sess-2")] - time.time() == pytest.approx(
        60, abs=2
    )

    with pytest.raises(ValueError):
        store.session_set("sess-3", {"a": "b"}, ttl=0)

    for bad in ("", "sess:*", "sess-1?", "[x]", "sess-1\n", "sess:1"):
        with pytest.raises(ValueError):
            store.session_set(bad, {"a": "b"})
        with pytest.raises(ValueError):
            store.session_get(bad)


def test_ttl_respected_short_expiry(fake_redis: Any) -> None:
    """A written TTL is applied and an elapsed deadline reads as a miss."""
    similar = store.similar_key("ele-001")
    store.cache_set(similar, {"items": ["ele-001"]}, ttl=5)
    deadline = fake_redis.expiry[similar]
    assert 0 < deadline - time.time() <= 5
    assert store.cache_get(similar) is not None

    fake_redis.expiry[similar] = time.time() - 1
    assert store.cache_get(similar) is None

    store.session_set("sess-short", {"last_item": "ele-001"}, ttl=5)
    assert store.session_get("sess-short") == {"last_item": "ele-001"}
    fake_redis.expiry[store.session_key("sess-short")] = time.time() - 0.001
    assert store.session_get("sess-short") is None

    recs = store.recs_key("user-001", "home", "", "v1")
    store.cache_set(recs, {"items": ["a"]}, ttl=1)
    assert fake_redis.expiry[recs] - time.time() == pytest.approx(
        store.RECS_TTL_MIN_S, abs=2
    )
    fake_redis.expiry[recs] = time.time() - 1
    assert store.cache_get(recs) is None

    store.cache_set(recs, {"items": ["b"]})
    assert store.cache_get(recs)["data"] == {"items": ["b"]}

    assert store.invalidate_on_event("user-001") == 1


def test_redis_down_raises_cache_unavailable(dead_redis: Any) -> None:
    """Every store call maps Redis connection errors to CacheUnavailable."""
    key = store.recs_key("user-001", "home", "", "v1")

    with pytest.raises(store.CacheUnavailable):
        store.cache_get(key)

    with pytest.raises(store.CacheUnavailable):
        store.cache_set(key, {"items": []})

    with pytest.raises(store.CacheUnavailable):
        store.invalidate_on_event("user-001")

    with pytest.raises(store.CacheUnavailable):
        store.session_set("sess-1", {"a": "b"})

    with pytest.raises(store.CacheUnavailable):
        store.session_get("sess-1")

    assert issubclass(store.CacheUnavailable, Exception)
    assert isinstance(store.CacheUnavailable("dead"), store.CacheUnavailable)

    with pytest.raises(ValueError):
        store.invalidate_on_event("user-*")
