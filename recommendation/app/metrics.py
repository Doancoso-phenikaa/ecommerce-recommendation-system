"""Prometheus metrics + impression logging for the recommendation service (todo 15).

Minimal viable form (P99 SLO gating deferred to Phase 2):

- Histogram ``recsys_request_latency_seconds`` labeled ``{route}``.
- Counter ``recs_served_total`` labeled ``{strategy, cold_start}``.
- Gauge ``bus_publish_failures`` — synced from
  :func:`bus.get_bus_publish_failures` at scrape time inside the
  ``/metrics`` handler. This is the source of truth for broker-down
  spool counts.

Design choice (documented per spec): ``bus.py`` behavior is NOT modified,
so the live broker-down count owned by ``bus.py`` is surfaced as the
``bus_publish_failures`` gauge, refreshed from
``get_bus_publish_failures()`` on every scrape. A same-stem
``bus_publish_failures_total`` counter is deliberately NOT created:
prometheus_client reserves the ``bus_publish_failures`` stem (plus
``_total``/``_created``) for such a counter, which would make the gauge
unregistrable in the same registry. :func:`inc_publish_failures` therefore
increments the gauge best-effort (the scrape-time sync re-asserts the true
bus value, so manual increments never corrupt it).

Public helpers (wired into ``main.py`` GET routes):

- :func:`observe_request(route, latency_s, strategy, cold_start)` —
  observe latency + increment ``recs_served_total``.
- :func:`log_impression(...)` — append one JSON line per served response
  to ``recommendation/data/impressions.jsonl`` with a fresh
  :func:`~recommendation.app.schemas.uuid4_hex` ``request_id`` per line.
  Never raises (fsync-less append; errors swallowed so serving never
  blocks/fails). Only PII logged is ``user_id``.

Kill switch: ``RECSYS_METRICS=off`` (env, read at call time) makes
``/metrics`` return 503 while all serving routes stay 200. Helpers
no-op when disabled.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi.responses import Response
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    REGISTRY,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)

from recommendation.app import bus
from recommendation.app.schemas import uuid4_hex

__all__ = [
    "router",
    "metrics_enabled",
    "observe_request",
    "inc_publish_failures",
    "log_impression",
    "IMPRESSIONS_PATH",
    "REQUEST_LATENCY",
    "RECS_SERVED",
    "BUS_PUBLISH_FAILURES",
]

#: Impression log path (resolved relative to this file so any CWD works).
IMPRESSIONS_PATH = Path(__file__).resolve().parents[1] / "data" / "impressions.jsonl"


def _get_or_create(metric_cls: Any, name: str, doc: str, labels: tuple[str, ...]) -> Any:
    """Create a prometheus metric, reusing the registered one on reload.

    Module reloads in the same process (tests) would otherwise raise
    ``ValueError: Duplicated timeseries``. Reuse only applies when the
    registered collector is already of the requested type; a same-stem
    different-type collision is a real bug and must surface, not be
    silently aliased.
    """
    existing = REGISTRY._names_to_collectors.get(name)  # noqa: SLF001 — stable internal map
    if existing is not None:
        if isinstance(existing, metric_cls):
            return existing
        raise ValueError(
            f"Metric name collision: {name!r} already registered "
            f"as {type(existing).__name__}, not {metric_cls.__name__}"
        )
    if labels:
        return metric_cls(name, doc, labelnames=list(labels))
    return metric_cls(name, doc)


REQUEST_LATENCY: Histogram = _get_or_create(
    Histogram,
    "recsys_request_latency_seconds",
    "Serving request latency in seconds.",
    ("route",),
)

RECS_SERVED: Counter = _get_or_create(
    Counter,
    "recs_served_total",
    "Recommendation responses served.",
    ("strategy", "cold_start"),
)

BUS_PUBLISH_FAILURES: Gauge = _get_or_create(
    Gauge,
    "bus_publish_failures",
    "Live broker-down spool count from bus.get_bus_publish_failures(), "
    "synced at scrape time.",
    (),
)


def metrics_enabled() -> bool:
    """True unless ``RECSYS_METRICS=off`` (case-insensitive, read at call time)."""
    return os.getenv("RECSYS_METRICS", "on").strip().lower() != "off"


def observe_request(
    route: str, latency_s: float, strategy: str, cold_start: bool
) -> None:
    """Observe one served request (latency histogram + served counter).

    Never raises; no-ops when metrics are disabled.
    """
    try:
        if not metrics_enabled():
            return
        REQUEST_LATENCY.labels(route=route).observe(max(0.0, float(latency_s)))
        RECS_SERVED.labels(strategy=str(strategy), cold_start=str(bool(cold_start)).lower()).inc()
    except Exception:
        pass


def inc_publish_failures() -> None:
    """Best-effort increment of the ``bus_publish_failures`` gauge.

    The ``/metrics`` handler re-syncs the gauge to the true bus counter
    at scrape time, so manual increments never corrupt it. Never raises;
    no-ops when disabled.
    """
    try:
        if not metrics_enabled():
            return
        BUS_PUBLISH_FAILURES.inc()
    except Exception:
        pass


def log_impression(
    *,
    user_id: str | None,
    route: str,
    item_ids: list[str],
    strategy: str,
    model_version: str,
    latency_ms: float,
) -> str | None:
    """Append one impression JSON line; return its ``request_id`` (None on error).

    Line shape: ``{request_id, user_id, route, item_ids, strategy,
    model_version, latency_ms}``. ``request_id`` is a fresh
    :func:`~recommendation.app.schemas.uuid4_hex` per response so lines
    are joinable. Fsync-less plain append — never raises, never blocks
    serving. Only PII written is ``user_id``.
    """
    try:
        if not metrics_enabled():
            return None
        record = {
            "request_id": uuid4_hex(),
            "user_id": user_id,
            "route": route,
            "item_ids": list(item_ids),
            "strategy": strategy,
            "model_version": model_version,
            "latency_ms": latency_ms,
        }
        IMPRESSIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(IMPRESSIONS_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record) + "\n")
        return record["request_id"]
    except Exception:
        return None


router = APIRouter()


@router.get("/metrics")
def get_metrics() -> Response:
    """Prometheus scrape endpoint (todo 15).

    Disabled (``RECSYS_METRICS=off``) → 503 ``metrics disabled``.
    Otherwise sync the ``bus_publish_failures`` gauge from the live bus
    counter and return the registry exposition.
    """
    if not metrics_enabled():
        return Response(content="metrics disabled", status_code=503, media_type="text/plain")
    try:
        BUS_PUBLISH_FAILURES.set(float(bus.get_bus_publish_failures()))
    except Exception:
        pass
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
