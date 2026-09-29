"""Shared fixtures for the recommendation-service test suite.

Two jobs:

1. **Hermeticity** — every fixture that touches the filesystem redirects
   the module-level data/model paths into ``tmp_path``, so running the
   suite never mutates ``recommendation/data`` or ``recommendation/models``.
   The seeded parquet and the committed ``als_v1`` model stay pristine.
2. **Redis** — a ``FakeRedis`` covering exactly the command surface
   ``app/store.py`` and ``app/consumer.py`` use. Tests that need a dead
   Redis use ``dead_redis`` instead.

Run from the repo root::

    PYTHONPATH=. recommendation/.venv/bin/pytest recommendation/tests -q
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

import pandas as pd
import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from recommendation.app import baseline, bus, consumer, ranker, store  # noqa: E402
from recommendation.app.schemas import EventIn, EventType, EventValue  # noqa: E402

NOW = datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc)

#: Catalog used by the synthetic fixtures: 2 categories x 3 items.
ITEMS = [
    {"item_id": "ele-001", "title": "Volt Electronics One", "brand_id": "Volt",
     "category_path": ["electronics"], "price_cents": 1000, "available": True},
    {"item_id": "ele-002", "title": "Volt Electronics Two", "brand_id": "Volt",
     "category_path": ["electronics"], "price_cents": 2000, "available": True},
    {"item_id": "ele-003", "title": "Amp Electronics Three", "brand_id": "Amp",
     "category_path": ["electronics"], "price_cents": 3000, "available": True},
    {"item_id": "boo-001", "title": "Papr Books One", "brand_id": "Papr",
     "category_path": ["books"], "price_cents": 1500, "available": True},
    {"item_id": "boo-002", "title": "Papr Books Two", "brand_id": "Papr",
     "category_path": ["books"], "price_cents": 2500, "available": True},
    {"item_id": "boo-003", "title": "Leaf Books Three", "brand_id": "Leaf",
     "category_path": ["books"], "price_cents": 3500, "available": True},
]

#: ``(user_id, item_id, event_type, days_ago)`` — enough history for a
#: known user, a light user, and an absent user.
EVENT_SPECS = [
    ("user-001", "ele-001", EventType.view, 20),
    ("user-001", "ele-002", EventType.click, 18),
    ("user-001", "ele-003", EventType.cart, 16),
    ("user-001", "boo-001", EventType.purchase, 14),
    ("user-001", "boo-002", EventType.view, 12),
    ("user-001", "boo-003", EventType.wishlist, 10),
    ("user-002", "boo-001", EventType.view, 9),
    ("user-002", "boo-002", EventType.click, 7),
    ("user-002", "boo-003", EventType.purchase, 5),
    ("user-003", "ele-001", EventType.view, 4),
]


def make_event(
    user_id: str,
    item_id: str = "ele-001",
    event_type: EventType = EventType.view,
    *,
    days_ago: int = 1,
    value: EventValue | None = None,
    request_id: str | None = None,
    session_id: str | None = None,
) -> EventIn:
    """Build a valid :class:`EventIn` for fixture use.

    Purchases get revenue automatically — ``EventIn`` rejects a purchase
    whose ``value`` lacks ``unit_price_cents``/``quantity``/``currency``.
    """
    if value is None and event_type is EventType.purchase:
        value = EventValue(
            quantity=1, unit_price_cents=1999, currency="USD"
        )
    return EventIn(
        request_id=request_id or f"req-{user_id}-{item_id}-{event_type.value}-{days_ago}",
        user_id=user_id,
        item_id=item_id,
        event_type=event_type,
        timestamp=NOW - timedelta(days=days_ago),
        value=value,
        session_id=session_id,
    )


@pytest.fixture
def items_frame() -> pd.DataFrame:
    return pd.DataFrame(ITEMS)


@pytest.fixture
def events_frame() -> pd.DataFrame:
    return build_events_frame()


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    d = tmp_path / "data"
    d.mkdir()
    return d


@pytest.fixture
def models_dir(tmp_path: Path) -> Path:
    d = tmp_path / "models"
    d.mkdir()
    return d


@pytest.fixture
def write_parquet(data_dir: Path, models_dir: Path) -> Any:
    """Return a loader that writes the synthetic frames + a model pointer.

    The returned callable patches the module-level path globals in
    ``baseline``, ``ranker``, ``consumer``, ``train_als``, and ``main``,
    and clears the ``lru_cache``d loaders, so no test ever reads the real
    ``recommendation/data`` or ``recommendation/models``.
    """
    def _load(
        items: pd.DataFrame | None = None,
        events: pd.DataFrame | None = None,
        *,
        version: str | None = "v1",
    ) -> Path:
        items = ITEMS_FRAME if items is None else items
        events = EVENTS_FRAME if events is None else events
        interactions = data_dir / "interactions.parquet"
        catalog = data_dir / "items.parquet"
        events.to_parquet(interactions, index=False)
        items.to_parquet(catalog, index=False)
        (data_dir / "incoming").mkdir(exist_ok=True)

        baseline._ITEMS_PARQUET = catalog
        baseline._INTERACTIONS_PARQUET = interactions
        baseline._load_items.cache_clear()
        baseline._load_interactions.cache_clear()
        baseline._tfidf_matrix.cache_clear()

        ranker._ITEMS_PARQUET = catalog
        ranker._INTERACTIONS_PARQUET = interactions
        ranker._MODELS_DIR = models_dir

        consumer.DATA_DIR = data_dir
        consumer.INCOMING_DIR = data_dir / "incoming"
        consumer.INTERACTIONS_PATH = interactions
        consumer.MERGE_LOCK_PATH = data_dir / ".merge.lock"

        import recommendation.app.main as main_mod
        import recommendation.app.metrics as metrics_mod
        import recommendation.app.train_als as train_mod

        main_mod._MODELS_DIR = models_dir
        metrics_mod.IMPRESSIONS_PATH = data_dir / "impressions.jsonl"
        train_mod.MODELS_DIR = models_dir

        if version is not None:
            (models_dir / "current_version.txt").write_text(
                f"{version}\n", encoding="utf-8"
            )
        return data_dir

    return _load


@pytest.fixture(autouse=True)
def _reset_globals() -> Iterator[None]:
    """Restore every patched global and clear caches after each test.

    Without this a test that redirects ``baseline._ITEMS_PARQUET`` would
    leak that path into the next test and into the live data directory.
    """
    saved = {
        "baseline_items": baseline._ITEMS_PARQUET,
        "baseline_inter": baseline._INTERACTIONS_PARQUET,
        "ranker_items": ranker._ITEMS_PARQUET,
        "ranker_inter": ranker._INTERACTIONS_PARQUET,
        "ranker_models": ranker._MODELS_DIR,
        "consumer_data": consumer.DATA_DIR,
        "consumer_incoming": consumer.INCOMING_DIR,
        "consumer_inter": consumer.INTERACTIONS_PATH,
        "consumer_lock": consumer.MERGE_LOCK_PATH,
    }
    import recommendation.app.main as main_mod
    import recommendation.app.metrics as metrics_mod
    import recommendation.app.train_als as train_mod

    saved["main_models"] = main_mod._MODELS_DIR
    saved["metrics_path"] = metrics_mod.IMPRESSIONS_PATH
    saved["train_models"] = train_mod.MODELS_DIR

    bus.reset_bus_publish_failures_for_tests()
    store.reset_client()
    yield

    baseline._ITEMS_PARQUET = saved["baseline_items"]
    baseline._INTERACTIONS_PARQUET = saved["baseline_inter"]
    baseline._load_items.cache_clear()
    baseline._load_interactions.cache_clear()
    baseline._tfidf_matrix.cache_clear()
    ranker._ITEMS_PARQUET = saved["ranker_items"]
    ranker._INTERACTIONS_PARQUET = saved["ranker_inter"]
    ranker._MODELS_DIR = saved["ranker_models"]
    consumer.DATA_DIR = saved["consumer_data"]
    consumer.INCOMING_DIR = saved["consumer_incoming"]
    consumer.INTERACTIONS_PATH = saved["consumer_inter"]
    consumer.MERGE_LOCK_PATH = saved["consumer_lock"]
    main_mod._MODELS_DIR = saved["main_models"]
    metrics_mod.IMPRESSIONS_PATH = saved["metrics_path"]
    train_mod.MODELS_DIR = saved["train_models"]
    bus.reset_bus_publish_failures_for_tests()
    store.reset_client()


class FakeRedis:
    """Minimal in-memory stand-in for the commands this project uses.

    Covers ``get``/``set``/``setex``/``delete``/``scan_iter``/``hset``/
    ``hgetall``/``expire``/``ping``/``incr``/``close`` — everything
    ``app/store.py`` and ``app/consumer.py`` call. Expiry is honoured on
    read so TTL tests are real.
    """

    def __init__(self) -> None:
        self.strings: dict[str, str] = {}
        self.hashes: dict[str, dict[str, str]] = {}
        self.expiry: dict[str, float] = {}

    # -- helpers -----------------------------------------------------
    @staticmethod
    def _now() -> float:
        import time

        return time.time()

    def _expired(self, key: str) -> bool:
        deadline = self.expiry.get(key)
        return deadline is not None and deadline <= self._now()

    def _live(self, key: str) -> bool:
        if self._expired(key):
            self.strings.pop(key, None)
            self.hashes.pop(key, None)
            self.expiry.pop(key, None)
            return False
        return True

    # -- redis surface -----------------------------------------------
    def ping(self) -> bool:
        return True

    def get(self, key: str) -> str | None:
        if not self._live(key):
            return None
        return self.strings.get(key)

    def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.strings[key] = value
        if ex is not None:
            self.expiry[key] = self._now() + ex
        return True

    def setex(self, key: str, ttl: int, value: str) -> bool:
        return self.set(key, value, ex=ttl)

    def delete(self, *keys: str) -> int:
        removed = 0
        for key in keys:
            removed += int(self.strings.pop(key, None) is not None)
            removed += int(self.hashes.pop(key, None) is not None)
            self.expiry.pop(key, None)
        return removed

    def scan_iter(self, match: str = "*", count: int | None = None) -> Iterator[str]:
        import fnmatch

        for key in list(self.strings) + list(self.hashes):
            if self._live(key) and fnmatch.fnmatchcase(key, match):
                yield key

    def hset(self, key: str, field: str = None, value: str = None,
             mapping: dict[str, str] | None = None) -> int:
        bucket = self.hashes.setdefault(key, {})
        added = 0
        if field is not None:
            added += int(field not in bucket)
            bucket[field] = value or ""
        for k, v in (mapping or {}).items():
            added += int(k not in bucket)
            bucket[k] = v
        return added

    def hgetall(self, key: str) -> dict[str, str]:
        if not self._live(key):
            return {}
        return dict(self.hashes.get(key, {}))

    def expire(self, key: str, ttl: int) -> bool:
        if not self._live(key):
            return False
        self.expiry[key] = self._now() + ttl
        return True

    def incr(self, key: str, amount: int = 1) -> int:
        current = int(self.strings.get(key, "0")) + amount
        self.strings[key] = str(current)
        return current

    def close(self) -> None:
        return None


class DeadRedis:
    """Raises ``redis.exceptions.ConnectionError`` on every call."""

    def __init__(self) -> None:
        import redis

        self._exc = redis.exceptions.ConnectionError("redis is down")

    def _boom(self, *args: Any, **kwargs: Any) -> Any:
        raise self._exc

    ping = _boom
    get = _boom
    set = _boom
    setex = _boom
    delete = _boom
    scan_iter = _boom
    hset = _boom
    hgetall = _boom
    expire = _boom
    incr = _boom
    close = _boom


@pytest.fixture
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    client = FakeRedis()
    monkeypatch.setattr(store, "get_redis", lambda: client)
    monkeypatch.setattr(consumer, "get_redis", lambda: client, raising=False)
    return client


@pytest.fixture
def dead_redis(monkeypatch: pytest.MonkeyPatch) -> DeadRedis:
    client = DeadRedis()
    monkeypatch.setattr(store, "get_redis", lambda: client)
    monkeypatch.setattr(consumer, "get_redis", lambda: client, raising=False)
    return client


@pytest.fixture
def settings_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict[str, str]:
    """Set the required env vars and return them for assertions."""
    env = {
        "REDIS_URL": "redis://localhost:6379/0",
        "MODEL_DIR": str(tmp_path / "models"),
        "KAFKA_BOOTSTRAP": "localhost:9092",
        "TOPIC": "user-events",
    }
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return env


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[Any]:
    """A ``TestClient`` over the real app with metrics side effects stubbed."""
    from fastapi.testclient import TestClient

    from recommendation.app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def trained_model(models_dir: Path, data_dir: Path) -> Path:
    """Train a real (tiny) ALS model into ``models_dir`` and return its path."""
    from recommendation.app import train_als

    import shutil

    events = build_events_frame()
    events.to_parquet(data_dir / "interactions.parquet", index=False)
    snapshot = models_dir / "snapshot_v1"
    (snapshot / "incoming").mkdir(parents=True, exist_ok=True)
    import shutil

    shutil.copy2(data_dir / "interactions.parquet", snapshot / "interactions.parquet")

    frame = train_als.load_snapshot_frame(snapshot)
    matrix, users, items_ids, n = train_als.build_user_item_matrix(frame)
    model = train_als.train_model(matrix, factors=4, iterations=2)
    out = models_dir / "als_v1"
    train_als.save_model(
        model, out, users, items_ids, factors=4, seed=train_als.SEED,
        n_interactions=n,
    )
    return out


def build_events_frame() -> pd.DataFrame:
    """Flatten :data:`EVENT_SPECS` into a parquet-shaped frame."""
    return pd.DataFrame(
        [
            consumer.event_to_row(make_event(u, i, t, days_ago=d))
            for u, i, t, d in EVENT_SPECS
        ]
    )


def write_events_jsonl(path: Path, events: list[EventIn]) -> None:
    """Write events as newline-delimited JSON (spool/DLQ format)."""
    path.write_text(
        "".join(json.dumps(json.loads(e.model_dump_json())) + "\n" for e in events),
        encoding="utf-8",
    )


ITEMS_FRAME = pd.DataFrame(ITEMS)
EVENTS_FRAME = build_events_frame()
