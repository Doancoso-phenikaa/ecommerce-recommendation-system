"""Metrics + impression-logging contract tests (todo 15).

Covers the whole of :mod:`recommendation.app.metrics` through its public
surface and through the real ``/metrics`` endpoint on
:data:`recommendation.app.main.app`:

- **Registry discipline** — :func:`metrics._get_or_create` returns the
  *same* collector object on a module reload, and raises on a
  same-name/different-type collision instead of silently aliasing it.
- **The kill switch** — ``RECSYS_METRICS`` is read from the environment at
  *call* time and case-insensitively, so each test flips it with
  ``monkeypatch.setenv``. When off, ``/metrics`` is 503 ``metrics disabled``
  while the serving routes stay 200, and every helper is a no-op.
- **Exposition** — ``observe_request`` moves
  ``recsys_request_latency_seconds`` and ``recs_served_total``; the
  ``/metrics`` handler re-syncs the ``bus_publish_failures`` gauge from
  :func:`bus.get_bus_publish_failures` on every scrape, so manual
  ``inc_publish_failures`` bumps never survive a scrape.
- **The impression log** — one JSON line per served response with the
  documented seven keys and a fresh 32-hex ``request_id`` per call,
  swallowed errors (``None`` on an unwritable path) and a total no-op when
  disabled.
- **Hermeticity** — ``test_conftest_redirect_keeps_live_data_clean`` is the
  canary for the whole suite: after the conftest redirection fixtures have
  been used, the committed ``recommendation/data`` and
  ``recommendation/models`` trees must be byte-for-byte untouched.

The prometheus ``REGISTRY`` is process-wide and therefore shared with the
other test modules, so every counter/gauge assertion here is *monotonic*
(``>=`` / ``+1`` relative to a pre-call sample) rather than an absolute
count. That keeps these tests order-independent while still proving the
observation actually happened.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest
from prometheus_client import REGISTRY, Counter, Gauge, Histogram, generate_latest

from recommendation.app import bus
from recommendation.app import metrics as metrics_mod

#: The real, committed service directories — must never be written to.
LIVE_DIR = Path(metrics_mod.__file__).resolve().parents[1]
LIVE_DATA = LIVE_DIR / "data"
LIVE_MODELS = LIVE_DIR / "models"

#: A fresh ``uuid4_hex`` request id.
HEX32 = re.compile(r"\A[0-9a-f]{32}\Z")

#: The exact line shape promised by :func:`metrics.log_impression`.
IMPRESSION_KEYS = {
    "request_id",
    "user_id",
    "route",
    "item_ids",
    "strategy",
    "model_version",
    "latency_ms",
}


# --------------------------------------------------------------------------
# Local helpers
# --------------------------------------------------------------------------
def _sample_values(body: str, metric: str) -> dict[str, float]:
    """Map ``name{labels}`` -> value for one metric family in an exposition."""
    out: dict[str, float] = {}
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.rpartition(" ")
        if key.split("{", 1)[0] != metric:
            continue
        out[key] = float(value)
    return out


def _registry_samples(metric: str) -> dict[str, float]:
    """Scrape the process-wide REGISTRY without going through HTTP.

    ``prometheus_client`` exposes no public per-child reader (``Counter``
    keeps ``_value``, ``Histogram`` keeps a ``_metrics`` dict), so the
    exposition text is the stable, public-ish contract to assert on.
    """
    return _sample_values(generate_latest(REGISTRY).decode("utf-8"), metric)


def _find_value(samples: dict[str, float], *label_pairs: str) -> float | None:
    """Return the single sample matching every ``label="value"`` fragment."""
    matches = [v for key, v in samples.items() if all(p in key for p in label_pairs)]
    assert len(matches) <= 1, f"ambiguous label set {label_pairs}: {matches}"
    return matches[0] if matches else None


def _labelled_value(samples: dict[str, float], *label_pairs: str) -> float | None:
    """Like :func:`_find_value`, but the sample must exist."""
    value = _find_value(samples, *label_pairs)
    assert value is not None, f"no sample for {label_pairs} in {sorted(samples)}"
    return value


def _counter_value(strategy: str, cold_start: bool) -> float:
    """Read ``recs_served_total`` for a label pair out of the exposition."""
    found = _find_value(
        _registry_samples("recs_served_total"),
        f'strategy="{strategy}"',
        f'cold_start="{str(cold_start).lower()}"',
    )
    return found if found is not None else 0.0


def _histogram_value(route: str) -> tuple[int, float]:
    """Return ``(count, sum)`` for one latency label set (0, 0.0 if unseen)."""
    counts = _find_value(
        _registry_samples("recsys_request_latency_seconds_count"), f'route="{route}"'
    )
    sums = _find_value(
        _registry_samples("recsys_request_latency_seconds_sum"), f'route="{route}"'
    )
    return int(counts or 0.0), float(sums or 0.0)


def _snapshot(root: Path) -> dict[str, tuple[int, int] | None]:
    """Map ``relative path -> (mtime_ns, size)``; ``None`` for directories."""
    out: dict[str, tuple[int, int] | None] = {}
    for path in sorted(root.rglob("*")):
        stat = path.stat()
        out[str(path.relative_to(root))] = (
            None if path.is_dir() else (stat.st_mtime_ns, stat.st_size)
        )
    return out


# --------------------------------------------------------------------------
# 1. Hermeticity canary
# --------------------------------------------------------------------------
def test_conftest_redirect_keeps_live_data_clean(
    tmp_path: Path, write_parquet: Any, client: Any, fake_redis: Any
) -> None:
    """The redirection fixtures keep ``recommendation/data`` pristine.

    This is the suite-wide canary: if any fixture ever stopped redirecting
    (or a helper escaped the patch), the seeded parquet, the committed
    ``als_v1`` model or a stray ``impressions.jsonl`` would land in the live
    tree. Snapshot before, exercise the fixtures, snapshot after.
    """
    live_impressions = LIVE_DATA / "impressions.jsonl"
    assert not live_impressions.exists(), (
        "impressions.jsonl already in the live data dir — a previous run "
        "wrote outside tmp_path"
    )
    data_before = _snapshot(LIVE_DATA)
    models_before = {k: v for k, v in _snapshot(LIVE_MODELS).items() if "/" not in k}
    parquet_before = {
        name: data_before[name] for name in data_before if name.endswith(".parquet")
    }
    assert parquet_before, "expected the committed seed parquet files"

    data_dir = write_parquet()
    assert data_dir.is_relative_to(tmp_path)

    # IMPRESSIONS_PATH must be redirected inside tmp_path, not the live dir.
    impressions = metrics_mod.IMPRESSIONS_PATH
    assert impressions.is_relative_to(tmp_path)
    assert impressions.parent == data_dir
    assert not impressions.exists()

    # Exercise both the writer and the readers through the redirected paths.
    request_id = metrics_mod.log_impression(
        user_id="user-001",
        route="/similar/ele-001",
        item_ids=["ele-002", "boo-001"],
        strategy="content",
        model_version="v1",
        latency_ms=1.25,
    )
    assert request_id and HEX32.match(request_id)
    assert impressions.exists() and impressions.is_relative_to(tmp_path)
    assert client.get("/similar/ele-001", params={"count": 3}).status_code == 200
    assert metrics_mod.observe_request("/similar", 0.01, "content", False) is None

    # The live tree is byte-for-byte identical, and still has no impression log.
    assert _snapshot(LIVE_DATA) == data_before
    assert {k: v for k, v in _snapshot(LIVE_MODELS).items() if "/" not in k} == (
        models_before
    )
    assert not live_impressions.exists()
    for name, stamp in parquet_before.items():
        assert _snapshot(LIVE_DATA)[name] == stamp


# --------------------------------------------------------------------------
# 2. Registry discipline
# --------------------------------------------------------------------------
def test_get_or_create_reuse_and_collision() -> None:
    """Same name+type reuses the collector; same name, other type raises."""
    # Reuse: a module reload (or a second caller) gets the identical object.
    assert (
        metrics_mod._get_or_create(  # noqa: SLF001 — the behaviour under test
            Counter, "recs_served_total", "doc", ("strategy", "cold_start")
        )
        is metrics_mod.RECS_SERVED
    )
    assert (
        metrics_mod._get_or_create(  # noqa: SLF001
            Histogram, "recsys_request_latency_seconds", "doc", ("route",)
        )
        is metrics_mod.REQUEST_LATENCY
    )
    assert (
        metrics_mod._get_or_create(  # noqa: SLF001
            Gauge, "bus_publish_failures", "doc", ()
        )
        is metrics_mod.BUS_PUBLISH_FAILURES
    )

    # Collision: a same-stem different-type request must surface, not alias.
    with pytest.raises(ValueError, match="Metric name collision"):
        metrics_mod._get_or_create(  # noqa: SLF001
            Gauge, "recs_served_total", "doc", ()
        )
    with pytest.raises(ValueError, match="already registered as Histogram"):
        metrics_mod._get_or_create(  # noqa: SLF001
            Gauge, "recsys_request_latency_seconds", "doc", ("route",)
        )
    with pytest.raises(ValueError, match="already registered as Gauge"):
        metrics_mod._get_or_create(  # noqa: SLF001
            Counter, "bus_publish_failures", "doc", ()
        )

    # Fresh name: created once, then reused (not re-registered) on the 2nd call.
    fresh = "recsys_test_only_reuse_probe"
    try:
        first = metrics_mod._get_or_create(  # noqa: SLF001
            Counter, fresh, "throwaway probe", ("label",)
        )
        second = metrics_mod._get_or_create(  # noqa: SLF001
            Counter, fresh, "throwaway probe", ("label",)
        )
        assert first is second
        assert REGISTRY._names_to_collectors.get(fresh) is first  # noqa: SLF001
        first.labels(label="x").inc()
        assert first.labels(label="x")._value.get() == 1.0  # noqa: SLF001
    finally:
        REGISTRY.unregister(first)


# --------------------------------------------------------------------------
# 3. The kill switch itself
# --------------------------------------------------------------------------
def test_metrics_enabled_kill_switch(
    monkeypatch: pytest.MonkeyPatch, client: Any, write_parquet: Any, fake_redis: Any
) -> None:
    """``RECSYS_METRICS=off`` 503s /metrics but leaves serving routes at 200."""
    monkeypatch.delenv("RECSYS_METRICS", raising=False)
    assert metrics_mod.metrics_enabled() is True
    for value in ("on", "ON", "on  ", "true", "1", ""):
        monkeypatch.setenv("RECSYS_METRICS", value)
        assert metrics_mod.metrics_enabled() is True, value
    for value in ("off", "OFF", "Off", "  off  "):
        monkeypatch.setenv("RECSYS_METRICS", value)
        assert metrics_mod.metrics_enabled() is False, value

    write_parquet()

    monkeypatch.setenv("RECSYS_METRICS", "off")
    disabled = client.get("/metrics")
    assert disabled.status_code == 503
    assert disabled.content == b"metrics disabled"
    assert disabled.headers["content-type"].startswith("text/plain")
    # Serving is unaffected by the kill switch.
    assert client.get("/similar/ele-001", params={"count": 3}).status_code == 200
    assert (
        client.get("/recommendations/user-001", params={"count": 3}).status_code == 200
    )

    # Flipped back at call time (no restart, no reload) -> full exposition.
    monkeypatch.setenv("RECSYS_METRICS", "on")
    enabled = client.get("/metrics")
    assert enabled.status_code == 200
    assert "recsys_request_latency_seconds" in enabled.text
    assert b"metrics disabled" not in enabled.content


# --------------------------------------------------------------------------
# 4. observe_request
# --------------------------------------------------------------------------
def test_observe_request_moves_histogram_and_counter(
    monkeypatch: pytest.MonkeyPatch, client: Any
) -> None:
    """One call moves both the latency histogram and the served counter."""
    monkeypatch.setenv("RECSYS_METRICS", "on")
    route, strategy, latency = "/probe/metrics", "als_hybrid", 0.25

    count_before, sum_before = _histogram_value(route)
    counter_before = _counter_value(strategy, False)

    assert metrics_mod.observe_request(route, latency, strategy, False) is None

    count_after, sum_after = _histogram_value(route)
    assert count_after == count_before + 1
    assert sum_after == pytest.approx(sum_before + latency)
    assert _counter_value(strategy, False) == pytest.approx(counter_before + 1)

    body = client.get("/metrics").text

    latencies = _sample_values(body, "recsys_request_latency_seconds_count")
    labelled = _labelled_value(latencies, f'route="{route}"')
    assert labelled is not None and labelled >= count_after
    sums = _sample_values(body, "recsys_request_latency_seconds_sum")
    sum_labelled = _labelled_value(sums, f'route="{route}"')
    assert sum_labelled is not None and sum_labelled >= sum_after

    served = _sample_values(body, "recs_served_total")
    served_labelled = _labelled_value(
        served, 'strategy="als_hybrid"', 'cold_start="false"'
    )
    assert served_labelled is not None and served_labelled >= counter_before + 1

    # The cold_start label is the lowercased bool, and route is the only
    # latency label — both are part of the published contract.
    true_before = _counter_value(strategy, True)
    metrics_mod.observe_request(route, latency, strategy, True)
    assert _counter_value(strategy, True) == true_before + 1
    body = client.get("/metrics").text
    assert _labelled_value(
        _sample_values(body, "recs_served_total"),
        'strategy="als_hybrid"',
        'cold_start="true"',
    ) >= true_before + 1


def test_observe_request_noop_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """With metrics off ``observe_request`` touches nothing at all."""
    route, strategy = "/probe/metrics-off", "als_hybrid"
    # Prime the label children so the disabled call is measured, not skipped.
    metrics_mod.observe_request(route, 0.1, strategy, False)
    count_before, sum_before = _histogram_value(route)
    counter_before = _counter_value(strategy, False)
    assert count_before >= 1

    monkeypatch.setenv("RECSYS_METRICS", "off")
    assert metrics_mod.metrics_enabled() is False
    for latency in (0.5, 12.0, -3.0):
        assert metrics_mod.observe_request(route, latency, strategy, False) is None
    assert _histogram_value(route) == (count_before, sum_before)
    assert _counter_value(strategy, False) == counter_before

    # Re-enabling resumes observation, and a negative latency is clamped to 0
    # rather than moving the sum backwards.
    monkeypatch.setenv("RECSYS_METRICS", "on")
    assert metrics_mod.observe_request(route, -3.0, strategy, False) is None
    count_now, sum_now = _histogram_value(route)
    assert count_now == count_before + 1
    assert sum_now == pytest.approx(sum_before)
    assert _counter_value(strategy, False) == counter_before + 1


# --------------------------------------------------------------------------
# 5. bus_publish_failures gauge
# --------------------------------------------------------------------------
def test_metrics_endpoint_syncs_bus_gauge(
    monkeypatch: pytest.MonkeyPatch, client: Any
) -> None:
    """Scrape time re-syncs ``bus_publish_failures`` from the live bus counter."""
    monkeypatch.setenv("RECSYS_METRICS", "on")
    bus.reset_bus_publish_failures_for_tests()
    try:
        assert bus.get_bus_publish_failures() == 0
        for _ in range(3):
            bus.record_bus_publish_failure()
        assert bus.get_bus_publish_failures() == 3

        body = client.get("/metrics").text
        assert client.get("/metrics").status_code == 200
        gauges = _sample_values(body, "bus_publish_failures")
        assert gauges == {"bus_publish_failures": 3.0}
        assert metrics_mod.BUS_PUBLISH_FAILURES._value.get() == 3.0  # noqa: SLF001
        # A same-stem counter is deliberately NOT created (see the module docstring).
        assert not _sample_values(body, "bus_publish_failures_total")
        assert "bus_publish_failures_created" not in body

        # A manual increment is overwritten by the next scrape, never persisted.
        metrics_mod.inc_publish_failures()
        assert metrics_mod.BUS_PUBLISH_FAILURES._value.get() == 4.0  # noqa: SLF001
        assert _sample_values(client.get("/metrics").text, "bus_publish_failures") == {
            "bus_publish_failures": 3.0
        }

        # Zeroing the bus is visible on the very next scrape.
        bus.reset_bus_publish_failures_for_tests()
        assert _sample_values(client.get("/metrics").text, "bus_publish_failures") == {
            "bus_publish_failures": 0.0
        }
    finally:
        bus.reset_bus_publish_failures_for_tests()


def test_inc_publish_failures_and_disabled_noop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The gauge increments when on and is a hard no-op when off."""
    monkeypatch.setenv("RECSYS_METRICS", "on")
    metrics_mod.BUS_PUBLISH_FAILURES.set(0.0)
    assert metrics_mod.BUS_PUBLISH_FAILURES._value.get() == 0.0  # noqa: SLF001

    for _ in range(3):
        assert metrics_mod.inc_publish_failures() is None
    assert metrics_mod.BUS_PUBLISH_FAILURES._value.get() == 3.0  # noqa: SLF001

    # The gauge is unlabelled, so a stray label is a hard error — swallowed.
    assert metrics_mod.inc_publish_failures.__doc__
    assert metrics_mod.BUS_PUBLISH_FAILURES._labelnames == ()  # noqa: SLF001

    monkeypatch.setenv("RECSYS_METRICS", "off")
    for _ in range(5):
        assert metrics_mod.inc_publish_failures() is None
    assert metrics_mod.BUS_PUBLISH_FAILURES._value.get() == 3.0  # noqa: SLF001

    # ...and the live bus counter is untouched by the disabled helper.
    bus.reset_bus_publish_failures_for_tests()
    assert metrics_mod.inc_publish_failures() is None
    assert bus.get_bus_publish_failures() == 0

    monkeypatch.setenv("RECSYS_METRICS", "on")
    metrics_mod.BUS_PUBLISH_FAILURES.set(0.0)
    metrics_mod.inc_publish_failures()
    assert metrics_mod.BUS_PUBLISH_FAILURES._value.get() == 1.0  # noqa: SLF001


# --------------------------------------------------------------------------
# 6. The impression log
# --------------------------------------------------------------------------
def test_log_impression_line_shape_and_fresh_ids(
    write_parquet: Any, tmp_path: Path
) -> None:
    """One valid JSON line per call with the documented keys + fresh id."""
    data_dir = write_parquet()
    impressions = metrics_mod.IMPRESSIONS_PATH
    assert impressions == data_dir / "impressions.jsonl"
    assert not impressions.exists()

    item_ids = ["ele-002", "boo-001", "ele-003"]
    first = metrics_mod.log_impression(
        user_id="user-001",
        route="/recommendations/user-001",
        item_ids=item_ids,
        strategy="als_hybrid",
        model_version="v1",
        latency_ms=12.5,
    )
    second = metrics_mod.log_impression(
        user_id="user-002",
        route="/similar/boo-001",
        item_ids=["boo-002"],
        strategy="trending",
        model_version="v1",
        latency_ms=3,
    )

    assert first and second
    assert HEX32.match(first), first
    assert HEX32.match(second), second
    assert first != second, "request_id must be fresh per response"

    lines = impressions.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    records = [json.loads(line) for line in lines]
    assert [r["request_id"] for r in records] == [first, second]

    for record, request_id in zip(records, (first, second)):
        assert set(record) == IMPRESSION_KEYS
        assert record["request_id"] == request_id
        assert isinstance(record["item_ids"], list)
        assert isinstance(record["latency_ms"], (int, float))
        assert isinstance(record["model_version"], str)

    assert records[0] == {
        "request_id": first,
        "user_id": "user-001",
        "route": "/recommendations/user-001",
        "item_ids": item_ids,
        "strategy": "als_hybrid",
        "model_version": "v1",
        "latency_ms": 12.5,
    }
    assert records[1]["route"] == "/similar/boo-001"
    assert records[1]["strategy"] == "trending"

    # ``item_ids`` is copied, so a caller mutating its list cannot rewrite history.
    item_ids.append("mutated-after-the-fact")
    assert json.loads(impressions.read_text(encoding="utf-8").splitlines()[0])[
        "item_ids"
    ] == ["ele-002", "boo-001", "ele-003"]

    # A third call appends rather than truncating.
    metrics_mod.log_impression(
        user_id=None,
        route="/similar/ele-001",
        item_ids=[],
        strategy="content",
        model_version="v1",
        latency_ms=0.0,
    )
    assert len(impressions.read_text(encoding="utf-8").splitlines()) == 3
    assert impressions.is_relative_to(tmp_path)


def test_log_impression_unwritable_returns_none(
    monkeypatch: pytest.MonkeyPatch, write_parquet: Any, tmp_path: Path
) -> None:
    """Every write failure is swallowed: ``None``, never an exception."""
    write_parquet()

    # (a) The parent path component is a regular file, so mkdir/open must fail.
    blocker = tmp_path / "blocker-file"
    blocker.write_text("not a directory\n", encoding="utf-8")
    monkeypatch.setattr(
        metrics_mod, "IMPRESSIONS_PATH", blocker / "nested" / "impressions.jsonl"
    )
    assert (
        metrics_mod.log_impression(
            user_id="user-001",
            route="/similar/ele-001",
            item_ids=["ele-002"],
            strategy="content",
            model_version="v1",
            latency_ms=1.0,
        )
        is None
    )
    assert blocker.read_text(encoding="utf-8") == "not a directory\n"

    # (b) The path itself is a directory -> open() raises, still swallowed.
    as_dir = tmp_path / "impressions-dir"
    as_dir.mkdir()
    monkeypatch.setattr(metrics_mod, "IMPRESSIONS_PATH", as_dir)
    assert (
        metrics_mod.log_impression(
            user_id="user-001",
            route="/similar/ele-001",
            item_ids=["ele-002"],
            strategy="content",
            model_version="v1",
            latency_ms=1.0,
        )
        is None
    )
    assert as_dir.is_dir() and list(as_dir.iterdir()) == []

    # (c) A hostile item_ids object that is not iterable is swallowed too.
    monkeypatch.setattr(
        metrics_mod, "IMPRESSIONS_PATH", tmp_path / "clean" / "impressions.jsonl"
    )
    assert (
        metrics_mod.log_impression(
            user_id="user-001",
            route="/similar/ele-001",
            item_ids=None,  # type: ignore[arg-type]
            strategy="content",
            model_version="v1",
            latency_ms=1.0,
        )
        is None
    )
    assert not (tmp_path / "clean" / "impressions.jsonl").exists()


def test_log_impression_disabled_writes_nothing(
    monkeypatch: pytest.MonkeyPatch, write_parquet: Any
) -> None:
    """``RECSYS_METRICS=off`` makes the impression log a total no-op."""
    data_dir = write_parquet()
    impressions = metrics_mod.IMPRESSIONS_PATH
    assert impressions == data_dir / "impressions.jsonl"

    # A first, enabled call proves the path is writable and observable.
    assert metrics_mod.log_impression(
        user_id="user-001",
        route="/similar/ele-001",
        item_ids=["ele-002"],
        strategy="content",
        model_version="v1",
        latency_ms=1.0,
    )
    before = impressions.read_bytes()
    assert len(before.splitlines()) == 1

    monkeypatch.setenv("RECSYS_METRICS", "off")
    for _ in range(3):
        assert (
            metrics_mod.log_impression(
                user_id="user-001",
                route="/similar/ele-001",
                item_ids=["ele-002"],
                strategy="content",
                model_version="v1",
                latency_ms=1.0,
            )
            is None
        )
    assert impressions.read_bytes() == before

    # And a never-written log stays absent entirely when disabled from the start.
    fresh_dir = data_dir / "never"
    monkeypatch.setattr(metrics_mod, "IMPRESSIONS_PATH", fresh_dir / "impressions.jsonl")
    assert (
        metrics_mod.log_impression(
            user_id=None,
            route="/similar/ele-001",
            item_ids=["ele-002"],
            strategy="content",
            model_version="v1",
            latency_ms=1.0,
        )
        is None
    )
    assert not fresh_dir.exists()

    # Re-enabling at call time resumes appending — no restart required.
    monkeypatch.setenv("RECSYS_METRICS", "on")
    resumed = metrics_mod.log_impression(
        user_id="user-001",
        route="/similar/ele-001",
        item_ids=["ele-002"],
        strategy="content",
        model_version="v1",
        latency_ms=1.0,
    )
    assert resumed and HEX32.match(resumed)
    assert (fresh_dir / "impressions.jsonl").exists()
