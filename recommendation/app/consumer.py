"""Kafka consumer dual-writing Parquet + Redis (todo 6).

Pipeline per micro-batch (commit-after-write, so no loss on crash)::

    poll -> validate (EventIn) -> batch parquet -> merge dedup
    -> redis counts -> offset commit

- Consumer group ``recsys-v1`` (:data:`RECSYS_GROUP`) on topic ``user-events``
  (``settings.topic``), ``enable_auto_commit=False``; offsets are committed
  only AFTER the batch has been persisted (parquet merge + redis best-effort).
- Valid records are written as one atomic file per batch to
  ``recommendation/data/incoming/batch_{ts}.parquet`` (``os.replace(tmp,
  final)``), then :func:`merge_batches` folds incoming batches into
  ``data/interactions.parquet`` with dedup on ``request_id``.
- Malformed records go to the ``user-events-dlq`` topic
  (``settings.topic + DLQ_TOPIC_SUFFIX``) with an ``error`` header, produced
  via ``bus.get_producer``; the consumer continues with the next record.
- Redis rolling counts: ``session:{id}`` + ``user:{id}`` hashes, INCR per
  event with TTL (via :mod:`recommendation.app.store` helpers / client).
  Redis failures never fail the batch (best-effort).
- Idempotent on ``request_id`` (merge dedups; replays add no rows).

LOCK PROTOCOL (CRITICAL — shared with the todo 9 trainer):

``fcntl`` locks are **advisory**: every reader/writer of
``data/interactions.parquet`` and ``data/incoming/`` MUST go through this
module's lockfile ``recommendation/data/.merge.lock``:

- :func:`merge_batches` holds an EXCLUSIVE (``LOCK_EX``) lock on
  ``.merge.lock`` for the whole list-read + merge + rewrite + cleanup.
- :func:`snapshot_for_training` (used by the todo 9 trainer) holds a SHARED
  (``LOCK_SH``) lock while listing ``data/incoming/`` first, then copying
  the listed files plus ``interactions.parquet`` into a snapshot dir, then
  releasing. The trainer reads the snapshot only — never live files.

Row schema matches ``scripts/seed.py`` exactly (flat columns):
``request_id, user_id, item_id, event_type, timestamp, session_id,
quantity, unit_price_cents, currency``.
"""

from __future__ import annotations

import fcntl
import json
import os
import shutil
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import pandas as pd

from recommendation.app.bus import DLQ_TOPIC_SUFFIX, get_producer
from recommendation.app.config import load_settings
from recommendation.app.schemas import EventIn
from recommendation.app.store import (
    SESSION_TTL_S,
    CacheUnavailable,
    get_redis,
    session_key,
)

__all__ = [
    "RECSYS_GROUP",
    "DATA_DIR",
    "INCOMING_DIR",
    "INTERACTIONS_PATH",
    "MERGE_LOCK_PATH",
    "USER_COUNTS_TTL_S",
    "event_to_row",
    "decode_record_value",
    "write_batch_parquet",
    "merge_batches",
    "snapshot_for_training",
    "update_redis_counts",
    "send_to_dlq",
    "process_batch",
]

#: Kafka consumer group id for the recommendation consumer.
RECSYS_GROUP = "recsys-v1"

DATA_DIR = Path("recommendation") / "data"
"""Live data dir (all writes stay inside ``recommendation/``)."""

INCOMING_DIR = DATA_DIR / "incoming"
"""Micro-batch landing dir: one ``batch_{ts}.parquet`` per batch."""

INTERACTIONS_PATH = DATA_DIR / "interactions.parquet"
"""Canonical interaction log (writers hold EXCLUSIVE ``.merge.lock``)."""

MERGE_LOCK_PATH = DATA_DIR / ".merge.lock"
"""Advisory-lock file shared by merger (EXCLUSIVE) and trainer (SHARED).

``fcntl`` locks are advisory, so every reader/writer MUST use this same
lockfile — never read/write ``interactions.parquet`` or ``incoming/``
directly from the trainer path; use :func:`snapshot_for_training`.
"""

USER_COUNTS_TTL_S = 86400
"""TTL for ``user:{id}`` rolling-count hashes (24h, seconds)."""


def _ensure_lockfile(lock_path: Path = MERGE_LOCK_PATH) -> None:
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path.touch(exist_ok=True)


@contextmanager
def _locked(lock_path: Path, exclusive: bool) -> Iterator[None]:
    """Hold an ``fcntl`` (shared/exclusive) lock on ``lock_path``."""
    _ensure_lockfile(lock_path)
    mode = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
    with open(lock_path, "r+") as fh:
        fcntl.flock(fh.fileno(), mode)
        try:
            yield
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


def user_key(user_id: str) -> str:
    """Build a ``user:{id}`` rolling-count hash key."""
    if not user_id or any(
        ch in user_id for ch in ("*", "?", "[", "]", "\\", "\n", "\r", ":")
    ):
        raise ValueError(f"invalid user_id for key: {user_id!r}")
    return f"user:{user_id}"


def event_to_row(event: EventIn) -> dict[str, Any]:
    """Flatten ``event`` to the seed-compatible parquet row dict."""
    value = event.value
    return {
        "request_id": event.request_id,
        "user_id": event.user_id,
        "item_id": event.item_id,
        "event_type": event.event_type.value,
        "timestamp": event.timestamp.isoformat(),
        "session_id": event.session_id,
        "quantity": value.quantity if value else None,
        "unit_price_cents": value.unit_price_cents if value else None,
        "currency": value.currency if value else None,
    }


def decode_record_value(value: Any) -> dict[str, Any]:
    """Decode a raw Kafka record value to a JSON dict.

    Accepts ``bytes``/``bytearray`` (UTF-8 JSON), ``str``, or an already
    decoded ``dict``. Raises ``ValueError`` on undecodable payloads.
    """
    if isinstance(value, dict):
        return value
    if isinstance(value, (bytes, bytearray)):
        try:
            value = bytes(value).decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError(f"record value is not UTF-8: {exc}") from exc
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError(f"record value is not JSON: {exc.msg}") from exc
        if not isinstance(decoded, dict):
            raise ValueError(
                f"record JSON must be an object, got {type(decoded).__name__}"
            )
        return decoded
    raise ValueError(f"unsupported record value type: {type(value).__name__}")


def write_batch_parquet(
    events: list[EventIn],
    incoming_dir: Path = INCOMING_DIR,
) -> Path | None:
    """Write ``events`` as one atomic ``batch_{ts}.parquet`` file.

    Atomic via temp file + ``os.replace(tmp, final)``. Returns the final
    path, or ``None`` when ``events`` is empty (no file written).
    """
    if not events:
        return None
    incoming_dir.mkdir(parents=True, exist_ok=True)
    rows = [event_to_row(e) for e in events]
    stamp = time.time_ns()
    final = incoming_dir / f"batch_{stamp}.parquet"
    tmp = incoming_dir / f".batch_{stamp}.tmp"
    pd.DataFrame(rows).to_parquet(tmp, index=False)
    os.replace(tmp, final)
    return final


def merge_batches(
    incoming_dir: Path = INCOMING_DIR,
    interactions_path: Path = INTERACTIONS_PATH,
    lock_path: Path = MERGE_LOCK_PATH,
) -> dict[str, int]:
    """Merge incoming batches into ``interactions.parquet`` (dedup).

    Holds EXCLUSIVE ``fcntl`` on ``lock_path`` during the whole
    list + read + merge + rewrite + cleanup, so a concurrent
    :func:`snapshot_for_training` (SHARED) can never observe a torn read.
    Dedups on ``request_id`` (keep last). Merged batch files are deleted
    only after the atomic ``os.replace`` of the merged parquet.
    Never appends directly to ``interactions.parquet`` concurrently —
    the merge always happens under the exclusive lock.
    """
    with _locked(lock_path, exclusive=True):
        batch_files = sorted(incoming_dir.glob("batch_*.parquet"))
        if not batch_files:
            return {"merged": 0, "total": 0, "files": 0}
        frames: list[pd.DataFrame] = []
        if interactions_path.exists():
            frames.append(pd.read_parquet(interactions_path))
        for path in batch_files:
            frames.append(pd.read_parquet(path))
        merged = (
            pd.concat(frames, ignore_index=True)
            if len(frames) > 1
            else frames[0].copy()
        )
        merged = merged.drop_duplicates(subset=["request_id"], keep="last")
        interactions_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = interactions_path.with_suffix(".tmp")
        merged.to_parquet(tmp, index=False)
        os.replace(tmp, interactions_path)
        for path in batch_files:
            path.unlink(missing_ok=True)
        return {
            "merged": len(merged),
            "total": len(merged),
            "files": len(batch_files),
        }


def snapshot_for_training(
    snapshot_dir: Path,
    incoming_dir: Path = INCOMING_DIR,
    interactions_path: Path = INTERACTIONS_PATH,
    lock_path: Path = MERGE_LOCK_PATH,
) -> dict[str, Any]:
    """Copy a consistent snapshot for training (todo 9 import path).

    Holds SHARED ``fcntl`` on ``lock_path`` while listing
    ``data/incoming/`` FIRST, then copying the listed files plus
    ``interactions.parquet`` into ``snapshot_dir``, then releasing.
    The trainer MUST read the snapshot only — never live files — so a
    concurrent :func:`merge_batches` (EXCLUSIVE) cannot tear the read.

    Import path (stable for todo 9):
    ``from recommendation.app.consumer import snapshot_for_training``.
    """
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    with _locked(lock_path, exclusive=False):
        batch_files = sorted(incoming_dir.glob("batch_*.parquet"))
        copied: list[str] = []
        dest_interactions = snapshot_dir / interactions_path.name
        if interactions_path.exists():
            shutil.copy2(interactions_path, dest_interactions)
            copied.append(dest_interactions.name)
        dest_incoming = snapshot_dir / "incoming"
        dest_incoming.mkdir(exist_ok=True)
        for path in batch_files:
            shutil.copy2(path, dest_incoming / path.name)
            copied.append(f"incoming/{path.name}")
    return {
        "snapshot_dir": str(snapshot_dir),
        "files": copied,
        "batches": len(batch_files),
    }


def update_redis_counts(event: EventIn) -> None:
    """INCR rolling counts for ``session:{id}`` + ``user:{id}`` with TTL.

    Best-effort: Redis outages (:class:`CacheUnavailable` / connection
    errors) are swallowed so one dead backend never fails the batch.
    """
    try:
        client = get_redis()
        field = event.event_type.value
        if event.session_id:
            skey = session_key(event.session_id)
            client.hincrby(skey, field, 1)
            client.expire(skey, SESSION_TTL_S)
        ukey = user_key(event.user_id)
        client.hincrby(ukey, field, 1)
        client.expire(ukey, USER_COUNTS_TTL_S)
    except (CacheUnavailable, Exception):
        return


def send_to_dlq(raw_value: Any, error: str) -> None:
    """Produce a malformed record to the ``<topic>-dlq`` topic.

    Uses ``bus.get_producer``; the ``error`` header carries the validation
    failure. Raises on broker-down (caller decides; the batch loop treats
    DLQ failure as non-fatal and continues).
    """
    settings = load_settings()
    producer = get_producer()
    if isinstance(raw_value, (bytes, bytearray)):
        payload: Any = bytes(raw_value)
    elif isinstance(raw_value, str):
        payload = raw_value.encode("utf-8")
    else:
        try:
            payload = json.dumps(raw_value).encode("utf-8")
        except (TypeError, ValueError):
            payload = str(raw_value).encode("utf-8")
    producer.send(
        settings.topic + DLQ_TOPIC_SUFFIX,
        value=payload,
        headers=[("error", str(error).encode("utf-8"))],
    )


def process_batch(
    records: list[Any],
    incoming_dir: Path = INCOMING_DIR,
    interactions_path: Path = INTERACTIONS_PATH,
    lock_path: Path = MERGE_LOCK_PATH,
    commit_callback: Any | None = None,
) -> dict[str, int]:
    """Validate ``records`` -> batch parquet -> merge dedup -> redis -> commit.

    ``records`` are raw Kafka records (or raw values / dicts in tests):
    each item may expose ``.value`` (kafka record) or be the value itself.
    Malformed events go to the DLQ with an ``error`` header and the
    consumer continues. Offsets are committed via ``commit_callback``
    (defaults to ``record.commit()``-style noop) only AFTER persist —
    commit-after-write, so a crash before commit replays without loss,
    and ``request_id`` dedup makes the replay idempotent.
    """
    valid: list[EventIn] = []
    malformed = 0
    dlq_sent = 0
    for record in records:
        raw = getattr(record, "value", record)
        try:
            payload = decode_record_value(raw)
            event = EventIn.model_validate(payload)
        except Exception as exc:
            malformed += 1
            try:
                send_to_dlq(raw, str(exc))
                dlq_sent += 1
            except Exception:
                pass
            continue
        valid.append(event)
    batch_path = write_batch_parquet(valid, incoming_dir=incoming_dir)
    merge_stats = merge_batches(
        incoming_dir=incoming_dir,
        interactions_path=interactions_path,
        lock_path=lock_path,
    )
    for event in valid:
        update_redis_counts(event)
    if commit_callback is not None:
        commit_callback()
    return {
        "received": len(records),
        "valid": len(valid),
        "malformed": malformed,
        "dlq_sent": dlq_sent,
        "merged": merge_stats.get("merged", 0),
        "batch_file": 1 if batch_path is not None else 0,
    }
