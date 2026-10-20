"""Kafka producer bus for the recommendation service (todo 5).

Publishes validated :class:`~recommendation.app.schemas.EventIn` events to
the ``user-events`` Kafka topic. On broker-down the event is spooled to a
local ``local_buffer.jsonl`` file (broker-down spool) and
:class:`BusUnavailable` is raised so the caller (todo 11) can map it to
``202-buffered`` instead of ``500``.

Naming split (do not conflate):

- Kafka topic ``user-events-dlq`` = malformed events (todo 6).
- Local file ``local_buffer.jsonl`` = broker-down spool (this module).

Blocking bound: :func:`publish_event` never blocks the caller for more
than 5 seconds (sync metadata fetch uses a 5s timeout).
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from recommendation.app.config import load_settings
from recommendation.app.schemas import EventIn, EventType

__all__ = [
    "BusUnavailable",
    "EVENT_WEIGHTS",
    "MAX_SPOOL_LINES",
    "MAX_SPOOL_BYTES",
    "DLQ_TOPIC_SUFFIX",
    "event_weight",
    "get_producer",
    "close_producer",
    "reset_producer_for_tests",
    "publish_event",
    "default_spool_path",
    "record_bus_publish_failure",
    "get_bus_publish_failures",
    "reset_bus_publish_failures_for_tests",
]

#: Timeout (seconds) for the synchronous metadata fetch in publish_event.
#: publish_event must never block its caller longer than this.
SEND_TIMEOUT_S = 5.0

#: Kafka topic suffix for malformed events (owned by todo 6, referenced only).
DLQ_TOPIC_SUFFIX = "-dlq"

#: Broker-down spool caps: at most 10k lines / 50MB; oldest lines dropped.
MAX_SPOOL_LINES = 10_000
MAX_SPOOL_BYTES = 50 * 1024 * 1024

#: Explicit weight per EventType member. ``rating`` holds the default weight
#: used when the event carries no rating value; the live rating weight is
#: computed by :func:`event_weight` (rating clamped to [1, 5]).
EVENT_WEIGHTS: dict[EventType, float] = {
    EventType.purchase: 5,
    EventType.wishlist: 3,
    EventType.cart: 2,
    EventType.click: 1,
    EventType.view: 1,
    EventType.rating: 3,
    EventType.impression: 0.2,
    EventType.search: 0.3,
}


def event_weight(event: EventIn) -> float:
    """Return the training weight for an event.

    Every :class:`EventType` member has an explicit entry in
    :data:`EVENT_WEIGHTS`; for ``rating`` events the weight is the event's
    ``value.rating`` clamped to [1, 5] (default 3 when absent).
    """
    if event.event_type is EventType.rating:
        rating: float | None = None
        if event.value is not None:
            rating = event.value.rating
        if rating is None:
            return EVENT_WEIGHTS[EventType.rating]
        return max(1.0, min(5.0, float(rating)))
    return EVENT_WEIGHTS[event.event_type]


class BusUnavailable(Exception):
    """Raised when the event was spooled locally because Kafka is down."""


_bus_publish_failures = 0
_bus_publish_failures_lock = threading.Lock()


def record_bus_publish_failure() -> int:
    """Increment the broker-down spool counter; return the new total.

    Module-level counter function the metrics todo can reuse.
    """
    global _bus_publish_failures
    with _bus_publish_failures_lock:
        _bus_publish_failures += 1
        return _bus_publish_failures


def get_bus_publish_failures() -> int:
    """Return the current broker-down spool counter value."""
    with _bus_publish_failures_lock:
        return _bus_publish_failures


def reset_bus_publish_failures_for_tests() -> None:
    """Reset the spool counter (tests only)."""
    global _bus_publish_failures
    with _bus_publish_failures_lock:
        _bus_publish_failures = 0


def default_spool_path() -> Path:
    """Resolve the broker-down spool file path.

    Overridable via the ``LOCAL_BUFFER_PATH`` env var (tests use a temp
    path so no live ``local_buffer.jsonl`` test data is ever tracked).
    """
    override = os.getenv("LOCAL_BUFFER_PATH")
    if override:
        return Path(override)
    return Path("recommendation") / "data" / "local_buffer.jsonl"


_producer: Any | None = None
_producer_lock = threading.Lock()


def get_producer(bootstrap_servers: str | None = None) -> Any:
    """Return the cached :class:`KafkaProducer` (create on first call).

    Settings come from :func:`load_settings` — no hardcoded broker outside
    the ``localhost:9092`` default in config. Producer uses ``acks=all``
    and ``retries=3``; ``key=user_id`` partitioning is applied per-send
    in :func:`publish_event`.
    """
    global _producer
    with _producer_lock:
        if _producer is not None:
            return _producer
        settings = load_settings()
        from kafka import KafkaProducer

        _producer = KafkaProducer(
            bootstrap_servers=bootstrap_servers or settings.kafka_bootstrap,
            acks="all",
            retries=3,
            key_serializer=lambda k: k.encode("utf-8") if isinstance(k, str) else k,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            request_timeout_ms=int(SEND_TIMEOUT_S * 1000),
            max_block_ms=int(SEND_TIMEOUT_S * 1000),
        )
        return _producer


def close_producer() -> None:
    """Flush and close the cached producer, if any."""
    global _producer
    with _producer_lock:
        producer, _producer = _producer, None
    if producer is not None:
        try:
            producer.flush(timeout=SEND_TIMEOUT_S)
        finally:
            producer.close()


def reset_producer_for_tests() -> None:
    """Drop the cached producer without I/O (tests only)."""
    global _producer
    with _producer_lock:
        _producer = None


def _enforce_spool_caps(lines: list[str], new_line: str) -> list[str]:
    """Drop oldest lines so appending ``new_line`` stays within caps."""
    new_size = sum(len(line.encode("utf-8")) for line in lines) + len(
        new_line.encode("utf-8")
    )
    while lines and (
        len(lines) >= MAX_SPOOL_LINES or new_size > MAX_SPOOL_BYTES
    ):
        dropped = lines.pop(0)
        new_size -= len(dropped.encode("utf-8"))
    return lines


def spool_event(event: EventIn, spool_path: Path | None = None) -> Path:
    """Append an event JSON line to the broker-down spool (crash-safe).

    Bounded: the file is capped at 10k lines / 50MB, oldest-first dropped.
    Each append is flushed and fsynced so a crash loses at most one batch.
    Returns the spool path used.
    """
    path = spool_path or default_spool_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    new_line = event.model_dump_json() + "\n"
    existing: list[str] = []
    if path.exists():
        with open(path, "r", encoding="utf-8") as fh:
            existing = fh.read().splitlines(keepends=True)
        existing = [ln if ln.endswith("\n") else ln + "\n" for ln in existing]
    kept_len_before = len(existing)
    kept = _enforce_spool_caps(existing, new_line)
    if len(kept) == kept_len_before:
        # Fast path: within caps — plain append, flushed + fsynced.
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(new_line)
            fh.flush()
            os.fsync(fh.fileno())
    else:
        # Caps forced drops — atomic rewrite of trimmed content + new line.
        kept.append(new_line)
        tmp = path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.writelines(kept)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    return path


def publish_event(
    event: EventIn,
    timeout: float = SEND_TIMEOUT_S,
    spool_path: Path | None = None,
    spool_on_failure: bool = True,
) -> Any:
    """Publish ``event`` to the ``user-events`` topic; return record metadata.

    Sends with ``key=event.user_id`` (partitioning) and a ``request_id``
    header. Waits for send metadata with a 5s timeout so the caller is
    never blocked longer than 5s.

    On broker-down (any exception, including timeout): the event JSON is
    spooled to ``local_buffer.jsonl`` first (never lost, unless
    ``spool_on_failure=False`` for callers like the replay script that
    manage the spool file themselves), the ``bus_publish_failures``
    counter is incremented, then :class:`BusUnavailable` is raised.
    """
    settings = load_settings()
    payload = event.model_dump(mode="json")
    try:
        producer = get_producer()
        future = producer.send(
            settings.topic,
            key=event.user_id,
            value=payload,
            headers=[("request_id", event.request_id.encode("utf-8"))],
        )
        return future.get(timeout=timeout)
    except Exception as exc:
        if spool_on_failure:
            spool_event(event, spool_path=spool_path)
        record_bus_publish_failure()
        raise BusUnavailable(
            f"Kafka unavailable; event spooled to {spool_path or default_spool_path()}"
        ) from exc
