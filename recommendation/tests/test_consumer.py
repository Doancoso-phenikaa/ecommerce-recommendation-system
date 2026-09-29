"""Tests for :mod:`recommendation.app.consumer` (todo 6).

Covers the record decoder, the flat row flattener, the atomic batch writer,
the exclusive-lock merger, the shared-lock snapshot, the best-effort Redis
rolling counts, the DLQ producer, and the commit-after-write batch loop.

Hermetic by construction: ``write_parquet()`` redirects
``consumer.DATA_DIR`` / ``INCOMING_DIR`` / ``INTERACTIONS_PATH`` /
``MERGE_LOCK_PATH`` into ``tmp_path``, and — because the app's function
signatures bind those paths as *default arguments* at import time (a module
global patch cannot rebind an already-evaluated default) — every call in this
file passes its paths explicitly. Redis is the ``fake_redis`` /
``dead_redis`` fixture; Kafka is a local fake producer.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from recommendation.app import consumer
from recommendation.app.schemas import EventType, EventValue
from recommendation.app.store import SESSION_TTL_S


def _load_conftest() -> Any:
    """Return the already-imported ``conftest`` module (or import it)."""
    mod = sys.modules.get("conftest")
    if mod is not None:
        return mod
    import importlib.util

    path = Path(__file__).with_name("conftest.py")
    spec = importlib.util.spec_from_file_location("conftest", path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules.setdefault("conftest", mod)
    spec.loader.exec_module(mod)
    return mod


#: ``conftest.make_event`` — the shared valid-``EventIn`` builder. Imported
#: as a module attribute (not a fixture) so it can be used in helpers.
make_event = _load_conftest().make_event


# --------------------------------------------------------------------------
# decode_record_value
# --------------------------------------------------------------------------

# Four accepted input shapes, all decoding to the same object: a bytearray
# and an already-decoded dict (neither is stringifiable, so pytest falls back
# to ``raw{index}``/``expected{index}``), plus a JSON ``str`` and raw Kafka
# ``bytes`` (which render as the decoded object repr). Order matters: it is
# what fixes the recovered node ids.
_OK_CASES = [
    (bytearray(b'{"a": 1}'), {"a": 1}),
    ('{"a": 1}', {"a": 1}),
    (b'{"a": 1}', {"a": 1}),
    ({"a": 1}, {"a": 1}),
]


@pytest.mark.parametrize(("raw", "expected"), _OK_CASES)
def test_decode_record_value_ok(raw: Any, expected: dict[str, Any]) -> None:
    assert consumer.decode_record_value(raw) == expected


_BAD_CASES = [
    42,  # unsupported python type
    "[1, 2]",  # valid JSON, but not an object
    "\xff\xfe",  # not valid UTF-8 JSON at all
    "not-json{",  # malformed JSON
    '{"a": 1} trailing junk {',  # JSON followed by garbage
]


@pytest.mark.parametrize("raw", _BAD_CASES)
def test_decode_record_value_rejects(raw: Any) -> None:
    with pytest.raises(ValueError):
        consumer.decode_record_value(raw)


# --------------------------------------------------------------------------
# event_to_row
# --------------------------------------------------------------------------


def test_event_to_row_flattens_revenue() -> None:
    event = make_event(
        "user-001",
        "ele-001",
        EventType.purchase,
        value=EventValue(quantity=3, unit_price_cents=1999, currency="USD"),
    )
    row = consumer.event_to_row(event)
    assert row["request_id"] == event.request_id
    assert row["user_id"] == "user-001"
    assert row["item_id"] == "ele-001"
    assert row["event_type"] == "purchase"
    assert row["quantity"] == 3
    assert row["unit_price_cents"] == 1999
    assert row["currency"] == "USD"
    assert row["timestamp"] == event.timestamp.isoformat()
    # Flat, seed-compatible column set (no nested "value" dict).
    assert set(row) == {
        "request_id",
        "user_id",
        "item_id",
        "event_type",
        "timestamp",
        "session_id",
        "quantity",
        "unit_price_cents",
        "currency",
        "rating",
        "query",
    }


def test_event_to_row_view_has_null_revenue() -> None:
    event = make_event("user-002", "boo-003", EventType.view)
    row = consumer.event_to_row(event)
    assert row["event_type"] == "view"
    assert row["quantity"] is None
    assert row["unit_price_cents"] is None
    assert row["currency"] is None
    assert row["rating"] is None
    assert row["query"] is None
    assert row["session_id"] is None


# --------------------------------------------------------------------------
# write_batch_parquet / merge_batches / snapshot_for_training
# --------------------------------------------------------------------------


def test_write_batch_atomic_no_tmp_left(tmp_path: Path) -> None:
    incoming = tmp_path / "incoming"
    events = [
        make_event("user-001", "ele-001", EventType.view, days_ago=3),
        make_event("user-002", "boo-001", EventType.click, days_ago=2),
    ]
    final = consumer.write_batch_parquet(events, incoming_dir=incoming)
    assert final is not None
    assert final.parent == incoming
    assert final.name.startswith("batch_") and final.suffix == ".parquet"
    # Atomic via os.replace: the temp file is gone, nothing left to clean.
    assert [p.name for p in incoming.iterdir()] == [final.name]
    frame = pd.read_parquet(final)
    assert len(frame) == 2
    assert set(frame["user_id"]) == {"user-001", "user-002"}


def test_write_batch_empty_writes_nothing(tmp_path: Path) -> None:
    incoming = tmp_path / "incoming"
    assert consumer.write_batch_parquet([], incoming_dir=incoming) is None
    assert not incoming.exists()


def test_merge_appends_to_existing_log(tmp_path: Path) -> None:
    incoming = tmp_path / "incoming"
    interactions = tmp_path / "interactions.parquet"
    lock = tmp_path / ".merge.lock"

    first = [
        make_event("user-001", "ele-001", EventType.view, days_ago=5),
        make_event("user-001", "ele-002", EventType.click, days_ago=4),
    ]
    consumer.write_batch_parquet(first, incoming_dir=incoming)
    stats1 = consumer.merge_batches(
        incoming_dir=incoming, interactions_path=interactions, lock_path=lock
    )
    assert stats1 == {"merged": 2, "total": 2, "files": 1}
    assert interactions.exists()

    second = [make_event("user-002", "boo-001", EventType.view, days_ago=1)]
    consumer.write_batch_parquet(second, incoming_dir=incoming)
    stats2 = consumer.merge_batches(
        incoming_dir=incoming, interactions_path=interactions, lock_path=lock
    )
    assert stats2 == {"merged": 3, "total": 3, "files": 1}

    frame = pd.read_parquet(interactions)
    assert len(frame) == 3
    assert sorted(frame["user_id"]) == ["user-001", "user-001", "user-002"]
    # Merged batch files are deleted only after the atomic replace.
    assert list(incoming.glob("batch_*.parquet")) == []


def test_merge_dedups_keep_last_and_cleans_up(tmp_path: Path) -> None:
    incoming = tmp_path / "incoming"
    interactions = tmp_path / "interactions.parquet"
    lock = tmp_path / ".merge.lock"
    incoming.mkdir()

    stale = consumer.event_to_row(
        make_event(
            "user-001", "ele-001", EventType.view, days_ago=9, request_id="req-dup"
        )
    )
    fresh = consumer.event_to_row(
        make_event(
            "user-001", "boo-002", EventType.click, days_ago=1, request_id="req-dup"
        )
    )
    pd.DataFrame([stale]).to_parquet(incoming / "batch_1.parquet", index=False)
    pd.DataFrame([fresh]).to_parquet(incoming / "batch_2.parquet", index=False)

    stats = consumer.merge_batches(
        incoming_dir=incoming, interactions_path=interactions, lock_path=lock
    )
    assert stats == {"merged": 1, "total": 1, "files": 2}
    frame = pd.read_parquet(interactions)
    assert len(frame) == 1
    # keep="last" — the later batch wins.
    assert frame.iloc[0]["item_id"] == "boo-002"
    assert frame.iloc[0]["event_type"] == "click"
    assert list(incoming.iterdir()) == []
    assert not (tmp_path / "interactions.tmp").exists()


def test_merge_empty_incoming_is_zero(tmp_path: Path) -> None:
    incoming = tmp_path / "incoming"
    incoming.mkdir()
    interactions = tmp_path / "interactions.parquet"
    stats = consumer.merge_batches(
        incoming_dir=incoming,
        interactions_path=interactions,
        lock_path=tmp_path / ".merge.lock",
    )
    assert stats == {"merged": 0, "total": 0, "files": 0}
    assert not interactions.exists()


def test_snapshot_copies_consistent_view(write_parquet: Any, tmp_path: Path) -> None:
    data_dir = write_parquet()
    interactions = Path(data_dir) / "interactions.parquet"
    incoming = Path(data_dir) / "incoming"

    extra = consumer.event_to_row(
        make_event("user-003", "ele-003", EventType.view, days_ago=1)
    )
    pd.DataFrame([extra]).to_parquet(incoming / "batch_999.parquet", index=False)

    snapshot = tmp_path / "snapshot_v1"
    result = consumer.snapshot_for_training(
        snapshot,
        incoming_dir=incoming,
        interactions_path=interactions,
        lock_path=Path(data_dir) / ".merge.lock",
    )
    assert result["snapshot_dir"] == str(snapshot)
    assert result["batches"] == 1
    assert result["files"] == ["interactions.parquet", "incoming/batch_999.parquet"]
    assert (snapshot / "interactions.parquet").is_file()
    assert (snapshot / "incoming" / "batch_999.parquet").is_file()
    # The snapshot is a copy: the live log is untouched by the read.
    assert len(pd.read_parquet(snapshot / "interactions.parquet")) == len(
        pd.read_parquet(interactions)
    )
    assert (Path(data_dir) / ".merge.lock").is_file()


# --------------------------------------------------------------------------
# Redis rolling counts
# --------------------------------------------------------------------------


def test_update_redis_counts_dead_redis_swallowed(dead_redis: Any) -> None:
    def _hincrby(*args: Any, **kwargs: Any) -> int:
        raise dead_redis._exc

    dead_redis.hincrby = _hincrby  # type: ignore[attr-defined]
    event = make_event("user-001", "ele-001", EventType.view, session_id="sess-1")
    # Must not raise: one dead backend never fails a batch.
    consumer.update_redis_counts(event)
    # A hostile user id (invalid key) is also swallowed rather than raised.
    hostile = make_event("user:*", "ele-001", EventType.view)
    consumer.update_redis_counts(hostile)


def _install_hincrby(client: Any) -> Any:
    """Add the ``HINCRBY`` command the conftest ``FakeRedis`` does not cover.

    ``consumer.update_redis_counts`` calls ``hincrby``; the shared fake only
    implements ``hset``/``incr``. Swallowed ``AttributeError``s would make this
    test pass vacuously, so the command is supplied locally here rather than by
    editing ``conftest.py``.
    """

    def hincrby(key: str, field: str, amount: int = 1) -> int:
        bucket = client.hashes.setdefault(key, {})
        total = int(bucket.get(field, "0")) + int(amount)
        bucket[field] = str(total)
        return total

    client.hincrby = hincrby
    return client


def test_update_redis_counts_fields_and_ttls(fake_redis: Any) -> None:
    _install_hincrby(fake_redis)
    event = make_event(
        "user-001", "ele-001", EventType.purchase, days_ago=1, session_id="sess-9"
    )
    consumer.update_redis_counts(event)
    consumer.update_redis_counts(event)

    assert fake_redis.hgetall("user:user-001") == {"purchase": "2"}
    assert fake_redis.hgetall("session:sess-9") == {"purchase": "2"}

    now = time.time()
    user_ttl = fake_redis.expiry["user:user-001"] - now
    sess_ttl = fake_redis.expiry["session:sess-9"] - now
    assert consumer.USER_COUNTS_TTL_S == 86400
    assert abs(user_ttl - consumer.USER_COUNTS_TTL_S) < 5
    assert abs(sess_ttl - SESSION_TTL_S) < 5

    # No session -> no session key at all.
    consumer.update_redis_counts(
        make_event("user-002", "boo-001", EventType.click, days_ago=1)
    )
    assert fake_redis.hgetall("user:user-002") == {"click": "1"}
    assert [k for k in fake_redis.hashes if k.startswith("session:")] == [
        "session:sess-9"
    ]


def test_user_key_valid_and_hostile() -> None:
    assert consumer.user_key("user-001") == "user:user-001"
    assert consumer.user_key("abc123") == "user:abc123"
    for bad in ("", "*", "a*", "a?", "a[1]", "a]", "a\\b", "a\nb", "a\rb", "a:b"):
        with pytest.raises(ValueError):
            consumer.user_key(bad)


# --------------------------------------------------------------------------
# DLQ + process_batch
# --------------------------------------------------------------------------


class _FakeProducer:
    """Records ``send`` calls instead of talking to a broker."""

    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    def send(
        self, topic: str, value: Any = None, headers: Any = None
    ) -> dict[str, Any]:
        self.sent.append({"topic": topic, "value": value, "headers": headers})
        return {"topic": topic}


def test_send_to_dlq_payload_shapes(
    settings_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    producer = _FakeProducer()
    monkeypatch.setattr(consumer, "get_producer", lambda *a, **k: producer)

    consumer.send_to_dlq(b'{"broken": ', "not json")
    consumer.send_to_dlq("plain text", "schema error")
    consumer.send_to_dlq({"item_id": ["a", "b"]}, "one product per event")

    assert [s["topic"] for s in producer.sent] == ["user-events-dlq"] * 3
    assert producer.sent[0]["value"] == b'{"broken": '
    assert producer.sent[1]["value"] == b"plain text"
    assert json.loads(producer.sent[2]["value"].decode("utf-8")) == {
        "item_id": ["a", "b"]
    }
    for sent, message in zip(
        producer.sent, ("not json", "schema error", "one product per event")
    ):
        assert sent["headers"] == [("error", message.encode("utf-8"))]


def _batch_record(event: Any) -> dict[str, Any]:
    """A raw record dict for ``event`` (the ``.value`` shape Kafka delivers)."""
    return consumer.event_to_row(event)


def _batch_paths(write_parquet: Any) -> tuple[Path, Path, Path]:
    """``(incoming, interactions, lock)`` under tmp with an EMPTY log.

    ``write_parquet`` seeds ``interactions.parquet`` with the shared 10-row
    event frame; the batch-loop tests need to start from zero rows so the
    merge stats describe only their own records.
    """
    data_dir = Path(write_parquet())
    (data_dir / "interactions.parquet").unlink()
    for stale in (data_dir / "incoming").glob("batch_*.parquet"):
        stale.unlink()
    return data_dir / "incoming", data_dir / "interactions.parquet", data_dir / ".merge.lock"


def test_process_batch_dlq_failure_is_nonfatal(
    write_parquet: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    incoming, interactions, lock = _batch_paths(write_parquet)

    def _boom(raw: Any, error: str) -> None:
        raise RuntimeError("broker down")

    monkeypatch.setattr(consumer, "send_to_dlq", _boom)

    good = _batch_record(make_event("user-001", "ele-001", EventType.view, days_ago=2))
    bad = {"user_id": "user-001", "item_id": "ele-002", "event_type": "nope"}
    commits: list[int] = []

    stats = consumer.process_batch(
        [good, bad],
        incoming_dir=incoming,
        interactions_path=interactions,
        lock_path=lock,
        commit_callback=lambda: commits.append(1),
    )
    # The DLQ failure did not propagate and did not stop the commit.
    assert stats == {
        "received": 2,
        "valid": 1,
        "malformed": 1,
        "dlq_sent": 0,
        "merged": 1,
        "batch_file": 1,
    }
    assert commits == [1]
    assert len(pd.read_parquet(interactions)) == 1


def test_process_batch_valid_malformed_idempotent(
    write_parquet: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    incoming, interactions, lock = _batch_paths(write_parquet)

    sent: list[tuple[Any, str]] = []
    monkeypatch.setattr(
        consumer, "send_to_dlq", lambda raw, error: sent.append((raw, error))
    )

    records = [
        _batch_record(make_event("user-001", "ele-001", EventType.view, days_ago=3)),
        _batch_record(make_event("user-001", "ele-002", EventType.click, days_ago=2)),
        {"user_id": "user-001"},  # missing item_id/event_type/timestamp
        "not-json{",
    ]
    commits: list[int] = []
    kwargs = {
        "incoming_dir": incoming,
        "interactions_path": interactions,
        "lock_path": lock,
        "commit_callback": lambda: commits.append(1),
    }

    first = consumer.process_batch(records, **kwargs)  # type: ignore[arg-type]
    assert first == {
        "received": 4,
        "valid": 2,
        "malformed": 2,
        "dlq_sent": 2,
        "merged": 2,
        "batch_file": 1,
    }
    assert len(sent) == 2
    assert len(pd.read_parquet(interactions)) == 2

    # Replay of the exact same records (crash before commit): dedup on
    # request_id means the log does not grow and the batch still commits.
    replay = consumer.process_batch(records, **kwargs)  # type: ignore[arg-type]
    assert replay == {
        "received": 4,
        "valid": 2,
        "malformed": 2,
        "dlq_sent": 2,
        "merged": 2,
        "batch_file": 1,
    }
    assert len(pd.read_parquet(interactions)) == 2
    assert commits == [1, 1]
    assert list(incoming.glob("batch_*.parquet")) == []
