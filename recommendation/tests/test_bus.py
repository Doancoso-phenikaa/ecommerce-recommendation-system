"""Tests for the Kafka producer bus (``app/bus.py``).

Covers the event-weight table (including the ``rating`` clamp), the
broker-down spool (path resolution, bounded drop-oldest, spool opt-out), the
``bus_publish_failures`` counter, producer lifecycle, and the
``BusUnavailable`` contract of :func:`publish_event`.

No real Kafka: ``bus.get_producer`` is always monkeypatched to a stub, and
the spool always points at ``tmp_path`` via ``LOCAL_BUFFER_PATH``.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest

from conftest import make_event
from recommendation.app import bus
from recommendation.app.bus import (
    MAX_SPOOL_BYTES,
    MAX_SPOOL_LINES,
    SEND_TIMEOUT_S,
    BusUnavailable,
    default_spool_path,
    event_weight,
    get_bus_publish_failures,
    record_bus_publish_failure,
    reset_bus_publish_failures_for_tests,
)
from recommendation.app.schemas import EventType, EventValue


class _StubFuture:
    """Stand-in for the ``FutureRecord`` returned by ``producer.send``."""

    def __init__(self, metadata: Any = None, error: Exception | None = None) -> None:
        self._metadata = metadata
        self._error = error
        self.timeouts: list[float | None] = []

    def get(self, timeout: float | None = None) -> Any:
        self.timeouts.append(timeout)
        if self._error is not None:
            raise self._error
        return self._metadata


class _StubProducer:
    """Records every bus call so tests can assert on send/flush/close."""

    def __init__(self, metadata: Any = None, error: Exception | None = None) -> None:
        self.future = _StubFuture(metadata, error=error)
        self.sends: list[dict[str, Any]] = []
        self.flushed: list[float | None] = []
        self.closed = False

    def send(self, topic: str, **kwargs: Any) -> _StubFuture:
        self.sends.append({"topic": topic, **kwargs})
        return self.future

    def flush(self, timeout: float | None = None) -> None:
        self.flushed.append(timeout)

    def close(self) -> None:
        self.closed = True


def _spool_to(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """Point ``default_spool_path`` at a temp file and return that path."""
    path = tmp_path / "local_buffer.jsonl"
    monkeypatch.setenv("LOCAL_BUFFER_PATH", str(path))
    return path


def _read_spool(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def test_close_producer_flushes_and_clears(monkeypatch: pytest.MonkeyPatch) -> None:
    """close_producer flushes within SEND_TIMEOUT_S, closes, and drops the cache."""
    producer = _StubProducer()
    monkeypatch.setattr(bus, "_producer", producer)

    bus.close_producer()

    assert producer.flushed == [SEND_TIMEOUT_S]
    assert producer.closed is True
    assert bus._producer is None
    assert SEND_TIMEOUT_S == 5.0

    # Closing again is a no-op: the cache is empty, so flush/close are not
    # repeated on a dead producer.
    bus.close_producer()
    assert producer.flushed == [SEND_TIMEOUT_S]
    assert producer.closed is True

    # A fresh producer is created on the next publish instead of reusing a
    # closed one.
    replacement = _StubProducer()
    monkeypatch.setattr(bus, "get_producer", lambda *a, **k: replacement)
    bus.reset_producer_for_tests()
    assert bus._producer is None


def test_default_spool_path_env_override(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """LOCAL_BUFFER_PATH overrides the spool; without it the repo-relative default is used."""
    monkeypatch.delenv("LOCAL_BUFFER_PATH", raising=False)
    assert default_spool_path() == Path("recommendation") / "data" / "local_buffer.jsonl"

    override = tmp_path / "nested" / "spool.jsonl"
    monkeypatch.setenv("LOCAL_BUFFER_PATH", str(override))
    assert default_spool_path() == override

    # An empty override is ignored (falsy) and falls back to the default.
    monkeypatch.setenv("LOCAL_BUFFER_PATH", "")
    assert default_spool_path() == Path("recommendation") / "data" / "local_buffer.jsonl"


def test_event_weight_table_and_rating_clamp() -> None:
    """EVENT_WEIGHTS covers every EventType; rating events clamp to [1, 5]."""
    assert set(bus.EVENT_WEIGHTS) == set(EventType)
    assert len(bus.EVENT_WEIGHTS) == 8
    assert bus.EVENT_WEIGHTS[EventType.purchase] == 5
    assert bus.EVENT_WEIGHTS[EventType.wishlist] == 3
    assert bus.EVENT_WEIGHTS[EventType.cart] == 2
    assert bus.EVENT_WEIGHTS[EventType.click] == 1
    assert bus.EVENT_WEIGHTS[EventType.view] == 1
    assert bus.EVENT_WEIGHTS[EventType.rating] == 3
    assert bus.EVENT_WEIGHTS[EventType.impression] == 0.2
    assert bus.EVENT_WEIGHTS[EventType.search] == 0.3

    # Non-rating events use the table verbatim.
    for event_type, expected in (
        (EventType.view, 1.0),
        (EventType.click, 1.0),
        (EventType.cart, 2.0),
        (EventType.wishlist, 3.0),
        (EventType.purchase, 5.0),
        (EventType.impression, 0.2),
        (EventType.search, 0.3),
    ):
        event = make_event("user-001", "ele-001", event_type)
        assert event_weight(event) == expected

    # A rating event with no value falls back to the table default.
    assert event_weight(make_event("user-001", "ele-001", EventType.rating)) == 3.0

    # A rating event uses its own rating, clamped to [1, 5].
    for raw, expected in (
        (-4.0, 1.0),
        (0.0, 1.0),
        (0.5, 1.0),
        (1.0, 1.0),
        (3.5, 3.5),
        (5.0, 5.0),
        (5.1, 5.0),
        (7.9, 5.0),
        (100.0, 5.0),
    ):
        rated = make_event(
            "user-001", "ele-001", EventType.rating, value=EventValue(rating=raw)
        )
        assert event_weight(rated) == expected

    # An explicit None rating also uses the default, not a clamp.
    none_rated = make_event(
        "user-001", "ele-001", EventType.rating, value=EventValue(rating=None)
    )
    assert event_weight(none_rated) == 3.0


def test_failure_counter_record_get_reset() -> None:
    """The broker-down counter increments monotonically and resets to zero."""
    assert get_bus_publish_failures() == 0

    assert record_bus_publish_failure() == 1
    assert record_bus_publish_failure() == 2
    assert record_bus_publish_failure() == 3
    assert get_bus_publish_failures() == 3

    reset_bus_publish_failures_for_tests()
    assert get_bus_publish_failures() == 0

    # Counting restarts from 1 after a reset.
    assert record_bus_publish_failure() == 1
    reset_bus_publish_failures_for_tests()
    assert get_bus_publish_failures() == 0


def test_publish_broker_down_spools_counts_and_raises(
    monkeypatch: pytest.MonkeyPatch, settings_env: dict[str, str], tmp_path: Path
) -> None:
    """Broker-down: spool the event, count the failure, raise BusUnavailable."""
    spool = _spool_to(monkeypatch, tmp_path)
    boom = OSError("broker down")
    producer = _StubProducer(error=boom)
    monkeypatch.setattr(bus, "get_producer", lambda *a, **k: producer)
    event = make_event("user-001", "ele-001", EventType.click, session_id="sess-9")

    with pytest.raises(BusUnavailable) as excinfo:
        bus.publish_event(event)

    # The original transport error is preserved as the cause.
    assert excinfo.value.__cause__ is boom
    assert str(spool) in str(excinfo.value)

    # The send was attempted with the configured topic before failing.
    assert producer.sends[0]["topic"] == settings_env["TOPIC"]
    assert producer.future.timeouts == [SEND_TIMEOUT_S]

    # The event is never lost: it lands in the spool exactly once.
    assert get_bus_publish_failures() == 1
    spooled = _read_spool(spool)
    assert len(spooled) == 1
    assert spooled[0]["request_id"] == event.request_id
    assert spooled[0]["user_id"] == "user-001"
    assert spooled[0]["item_id"] == "ele-001"
    assert spooled[0]["event_type"] == "click"
    assert spooled[0]["session_id"] == "sess-9"

    # A second broker-down failure appends and counts again.
    with pytest.raises(BusUnavailable):
        bus.publish_event(make_event("user-002", "boo-002", EventType.view))
    assert get_bus_publish_failures() == 2
    assert len(_read_spool(spool)) == 2
    assert producer.closed is False


def test_publish_no_spool_when_caller_manages_spool(
    monkeypatch: pytest.MonkeyPatch, settings_env: dict[str, str], tmp_path: Path
) -> None:
    """spool_on_failure=False skips the spool but still counts and raises."""
    default_spool = _spool_to(monkeypatch, tmp_path)
    explicit = tmp_path / "replay" / "spool.jsonl"
    event = make_event("user-003", "boo-003", EventType.wishlist)
    monkeypatch.setattr(bus, "get_producer", lambda *a, **k: _StubProducer(error=OSError("down")))

    with pytest.raises(BusUnavailable):
        bus.publish_event(event, spool_on_failure=False)

    # No spool file is created anywhere when the caller owns spooling.
    assert not default_spool.exists()
    assert get_bus_publish_failures() == 1

    # An explicit spool_path is honoured when spooling is enabled.
    monkeypatch.setattr(bus, "get_producer", lambda *a, **k: _StubProducer(error=OSError("down")))
    with pytest.raises(BusUnavailable):
        bus.publish_event(event, spool_path=explicit)

    assert explicit.exists()
    assert default_spool.exists() is False
    assert [row["request_id"] for row in _read_spool(explicit)] == [event.request_id]
    assert get_bus_publish_failures() == 2


def test_publish_success_returns_metadata_and_no_spool(
    monkeypatch: pytest.MonkeyPatch, settings_env: dict[str, str], tmp_path: Path
) -> None:
    """A successful send returns the record metadata and never spools."""
    spool = _spool_to(monkeypatch, tmp_path)
    metadata = {"topic": settings_env["TOPIC"], "partition": 2, "offset": 41}
    producer = _StubProducer(metadata=metadata)
    monkeypatch.setattr(bus, "get_producer", lambda *a, **k: producer)
    event = make_event("user-004", "ele-002", EventType.view, session_id="sess-1")

    result = bus.publish_event(event)

    assert result is metadata
    assert producer.future.timeouts == [SEND_TIMEOUT_S]

    send = producer.sends[0]
    assert send["topic"] == settings_env["TOPIC"]
    assert send["key"] == "user-004"
    assert send["headers"] == [("request_id", event.request_id.encode("utf-8"))]
    assert send["value"]["event_type"] == "view"
    assert send["value"]["user_id"] == "user-004"
    assert datetime.fromisoformat(send["value"]["timestamp"]) == event.timestamp
    assert send["value"]["request_id"] == event.request_id
    assert json.loads(json.dumps(send["value"])) == send["value"]

    # Nothing was spooled and no failure was counted.
    assert not spool.exists()
    assert get_bus_publish_failures() == 0


def test_spool_caps_drop_oldest(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The spool is bounded by MAX_SPOOL_LINES / MAX_SPOOL_BYTES, dropping oldest first."""
    spool = tmp_path / "capped.jsonl"
    events = [
        make_event("user-001", f"ele-00{i}", EventType.click, days_ago=i)
        for i in range(1, 6)
    ]

    # Line cap: after 5 appends with a 3-line cap, the newest 3 survive.
    monkeypatch.setattr(bus, "MAX_SPOOL_LINES", 3)
    for event in events:
        written = bus.spool_event(event, spool_path=spool)
        assert written == spool

    kept = _read_spool(spool)
    assert len(kept) == 3
    assert [row["item_id"] for row in kept] == ["ele-003", "ele-004", "ele-005"]
    assert [row["request_id"] for row in kept] == [e.request_id for e in events[2:]]
    # The atomic-rewrite temp file is cleaned up by os.replace.
    assert spool.with_suffix(".tmp").exists() is False

    # Byte cap: an oversized line evicts every existing line and is still
    # written, so the file can never grow without bound.
    monkeypatch.setattr(bus, "MAX_SPOOL_LINES", MAX_SPOOL_LINES)
    monkeypatch.setattr(bus, "MAX_SPOOL_BYTES", 8)
    for event in events:
        bus.spool_event(event, spool_path=spool)

    kept = _read_spool(spool)
    assert len(kept) == 1
    assert kept[0]["request_id"] == events[-1].request_id
    assert spool.stat().st_size > bus.MAX_SPOOL_BYTES
    assert spool.with_suffix(".tmp").exists() is False

    # Default caps are 10k lines / 50MB.
    monkeypatch.undo()
    assert bus.MAX_SPOOL_LINES == 10_000 == MAX_SPOOL_LINES
    assert bus.MAX_SPOOL_BYTES == 50 * 1024 * 1024 == MAX_SPOOL_BYTES
