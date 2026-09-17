"""Redis online/cache layer for the recommendation service.

Key scheme (personalized keys always embed the owning ``user_id`` and are
never served cross-user — enforced by construction: key builders require the
owner id and no helper accepts a "target user" differing from the key owner):

- ``recs:{user_id}:{context}:{filter}:{model_version}`` — personalized
  recommendations, TTL clamped to ``[RECS_TTL_MIN_S, RECS_TTL_MAX_S]``
  (default ``RECS_TTL_DEFAULT_S``).
- ``similar:{item_id}`` — content-similar items. Intentionally carries NO
  ``model_version``: content similarity is deterministic on the catalog
  (same item set + same similarity artefact => same neighbours), so
  versioning the key would only fragment the cache without benefit.
  TTL ``SIMILAR_TTL_S`` (hours).
- ``popular:{page}`` — global trending page, ``POPULAR_TTL_S`` via SETEX.
- ``session:{id}`` — per-session hash (``hset``/``hgetall`` + ``expire``).

Every :func:`cache_set` payload is stored as a JSON envelope
``{"data": <value>, "generatedAt": <ISO-8601 UTC>}`` so readers can reason
about freshness. Invalidation of a user's personalized entries uses
``SCAN`` (``scan_iter``) — never blocking ``KEYS``.

Connection failures (refused / timed-out Redis) surface as
:class:`CacheUnavailable`; callers fall back to uncached compute (that
fallback lives in todo 11 — this module only raises cleanly). A 2s socket
timeout guarantees a dead Redis never hangs request serving.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import redis

from recommendation.app.config import load_settings


class CacheUnavailable(Exception):
    """Raised when Redis cannot be reached (caller falls back to compute)."""


RECS_TTL_MIN_S = 60
"""Lower bound for personalized ``recs:*`` TTLs (seconds)."""

RECS_TTL_MAX_S = 300
"""Upper bound for personalized ``recs:*`` TTLs (seconds)."""

RECS_TTL_DEFAULT_S = 120
"""Default TTL for personalized ``recs:*`` entries (seconds)."""

SIMILAR_TTL_S = 6 * 3600
"""Default TTL for ``similar:*`` entries (6 hours, seconds)."""

POPULAR_TTL_S = 300
"""Default TTL for ``popular:*`` entries (seconds, via SETEX)."""

SESSION_TTL_S = 1800
"""Default TTL for ``session:*`` hashes (30 minutes, seconds)."""

_SOCKET_TIMEOUT_S = 2.0
"""Socket connect/read timeout so a dead Redis never hangs serving."""

_client: redis.Redis | None = None
_client_url: str | None = None


def get_redis() -> redis.Redis:
    """Return the shared Redis client built from settings ``REDIS_URL``.

    Uses ``decode_responses=True`` (str in/out) and a 2s socket timeout.
    The client is a URL-keyed singleton: if ``REDIS_URL`` changed since the
    last call, the client is rebuilt. A live Redis is used automatically
    when reachable — no code changes needed between fake and real backends.
    """
    global _client, _client_url
    url = load_settings().redis_url
    if _client is None or _client_url != url:
        _client = redis.Redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=_SOCKET_TIMEOUT_S,
            socket_timeout=_SOCKET_TIMEOUT_S,
        )
        _client_url = url
    return _client


def reset_client() -> None:
    """Drop the cached client (tests switch between fake and real backends)."""
    global _client, _client_url
    _client = None
    _client_url = None


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_plain(value: str, name: str) -> str:
    """Reject empty values and SCAN glob metacharacters in key segments."""
    if not value:
        raise ValueError(f"{name} must be a non-empty string")
    if any(ch in value for ch in ("*", "?", "[", "]", "\\", "\n", "\r")):
        raise ValueError(f"{name} contains a forbidden character: {value!r}")
    if ":" in value and name in ("user_id", "item_id", "page", "session_id"):
        raise ValueError(f"{name} must not contain ':': {value!r}")
    return value


def recs_key(
    user_id: str, context: str = "", filter: str = "", model_version: str = ""
) -> str:
    """Build a personalized key ``recs:{user_id}:{context}:{filter}:{model_version}``.

    ``user_id`` is mandatory — a personalized entry cannot exist without its
    owner, so it can never be served to another user.
    """
    _require_plain(user_id, "user_id")
    return f"recs:{user_id}:{context}:{filter}:{model_version}"


def similar_key(item_id: str) -> str:
    """Build a ``similar:{item_id}`` key.

    No ``model_version`` segment: content-similar neighbours are
    deterministic on the catalog, so versioning would only fragment hits.
    """
    _require_plain(item_id, "item_id")
    return f"similar:{item_id}"


def popular_key(page: str | int = 1) -> str:
    """Build a ``popular:{page}`` key for a global trending page."""
    return f"popular:{_require_plain(str(page), 'page')}"


def session_key(session_id: str) -> str:
    """Build a ``session:{id}`` key for a per-session hash."""
    return f"session:{_require_plain(session_id, 'session_id')}"


def _default_ttl(key: str) -> int:
    if key.startswith("similar:"):
        return SIMILAR_TTL_S
    if key.startswith("popular:"):
        return POPULAR_TTL_S
    if key.startswith("session:"):
        return SESSION_TTL_S
    return RECS_TTL_DEFAULT_S


def _effective_ttl(key: str, ttl: int | None) -> int:
    """Resolve ``ttl`` to seconds, clamping personalized keys to 60–300s."""
    resolved = _default_ttl(key) if ttl is None else int(ttl)
    if key.startswith("recs:"):
        resolved = max(RECS_TTL_MIN_S, min(RECS_TTL_MAX_S, resolved))
    elif resolved <= 0:
        raise ValueError(f"ttl must be positive, got {ttl!r}")
    return resolved


def cache_set(key: str, value: Any, ttl: int | None = None) -> None:
    """Store ``value`` under ``key`` with a ``generatedAt`` envelope (SETEX).

    :param key: full cache key (use :func:`recs_key` / :func:`similar_key` /
        :func:`popular_key` to build it).
    :param value: JSON-serializable payload.
    :param ttl: seconds; ``None`` selects the per-prefix default. Personalized
        ``recs:*`` TTLs are clamped to ``[60, 300]``.
    :raises CacheUnavailable: on Redis connection errors.
    """
    seconds = _effective_ttl(key, ttl)
    envelope = json.dumps({"data": value, "generatedAt": _utc_now_iso()})
    try:
        get_redis().set(key, envelope, ex=seconds)
    except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError) as exc:
        raise CacheUnavailable(f"Redis unavailable on cache_set({key!r})") from exc


def cache_get(key: str) -> dict[str, Any] | None:
    """Return the ``{"data", "generatedAt"}`` envelope for ``key`` or ``None``.

    A missing key, an expired key, or a corrupt (non-JSON) payload is a miss
    (``None``) — never an exception. Personalized keys embed their owner's
    ``user_id`` (see :func:`recs_key`), so a key built for user A simply
    cannot hit an entry stored for user B.

    :raises CacheUnavailable: on Redis connection errors.
    """
    try:
        raw = get_redis().get(key)
    except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError) as exc:
        raise CacheUnavailable(f"Redis unavailable on cache_get({key!r})") from exc
    if raw is None:
        return None
    try:
        envelope = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(envelope, dict) or "data" not in envelope:
        return None
    return envelope


def invalidate_on_event(user_id: str) -> int:
    """Delete ``recs:{user_id}:*`` via SCAN (never blocking KEYS).

    :returns: number of keys deleted.
    :raises CacheUnavailable: on Redis connection errors.
    """
    _require_plain(user_id, "user_id")
    pattern = f"recs:{user_id}:*"
    try:
        client = get_redis()
        keys = list(client.scan_iter(match=pattern))
        if not keys:
            return 0
        return int(client.delete(*keys))
    except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError) as exc:
        raise CacheUnavailable(
            f"Redis unavailable on invalidate_on_event({user_id!r})"
        ) from exc


def session_set(
    session_id: str, mapping: dict[str, str], ttl: int | None = None
) -> None:
    """Write a ``session:{id}`` hash via ``hset`` + ``expire``."""
    key = session_key(session_id)
    seconds = SESSION_TTL_S if ttl is None else int(ttl)
    if seconds <= 0:
        raise ValueError(f"ttl must be positive, got {ttl!r}")
    try:
        client = get_redis()
        client.hset(key, mapping=mapping)
        client.expire(key, seconds)
    except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError) as exc:
        raise CacheUnavailable(f"Redis unavailable on session_set({key!r})") from exc


def session_get(session_id: str) -> dict[str, str] | None:
    """Return the ``session:{id}`` hash, or ``None`` when absent/expired."""
    key = session_key(session_id)
    try:
        data = get_redis().hgetall(key)
    except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError) as exc:
        raise CacheUnavailable(f"Redis unavailable on session_get({key!r})") from exc
    if not data:
        return None
    return dict(data)


__all__ = [
    "CacheUnavailable",
    "RECS_TTL_MIN_S",
    "RECS_TTL_MAX_S",
    "RECS_TTL_DEFAULT_S",
    "SIMILAR_TTL_S",
    "POPULAR_TTL_S",
    "SESSION_TTL_S",
    "get_redis",
    "reset_client",
    "recs_key",
    "similar_key",
    "popular_key",
    "session_key",
    "cache_get",
    "cache_set",
    "invalidate_on_event",
    "session_set",
    "session_get",
]
