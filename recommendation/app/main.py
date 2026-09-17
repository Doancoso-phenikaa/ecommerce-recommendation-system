"""FastAPI serving app for the recommendation service (todo 11).

Stable import path for todos 13/15::

    from recommendation.app.main import app

Run from the repo root::

    uvicorn recommendation.app.main:app --port 8000

(Port 8001 is VERIFICATION-ONLY — dev default is 8000.)

Routes:

- ``POST /events`` — parse :class:`EventIn` (invalid bodies → 422 via
  FastAPI validation), publish via ``bus.publish_event`` → 202
  ``{status: "queued", request_id}``. On :class:`BusUnavailable` the
  event was already spooled to ``local_buffer.jsonl`` by the bus, so
  the response is still 202 with ``status="queued-buffered"`` — never
  a 500 for a valid event when Kafka is down.
- ``GET /recommendations/{user_id}?count=20&context=homepage`` —
  cache key via ``store.recs_key(user_id, context, filter,
  model_version)`` (``model_version`` read from the
  ``models/current_version.txt`` pointer, ``"none"`` when missing, so
  a user-A key can never serve user-B). ``store.cache_get`` hit →
  cached ``RecResponse`` + ``X-Cache: HIT``; miss or
  ``CacheUnavailable`` → ``ranker.rank`` (unknown users fall back to
  popular *inside* the ranker — never a 404-empty) →
  best-effort ``store.cache_set`` (``CacheUnavailable`` swallowed) →
  ``X-Cache: MISS``.
- ``GET /similar/{item_id}?count=10`` — shareable cache via
  ``store.similar_key`` (no model version: content neighbours are
  deterministic on the catalog), content via
  ``baseline.content_similar`` wrapped as ``SimilarResponse`` with the
  file-pointer ``model_version`` and ``strategy="content"``.
- ``GET /health`` — ``{status, kafka, redis, model_version}``: Kafka
  reachability (short socket probe, no producer side effects), Redis
  ``PING``, model-pointer presence. ``status`` is ``"ok"`` only when
  all three are up, else ``"degraded"``.

Boot never requires Kafka/Redis live: clients are built lazily and
every request-time failure degrades (buffered / uncached / degraded).
``bus.publish_event`` enforces the never-block->5s-on-Kafka bound.

Per-request JSON log line (``user_id``/``route``/``count``/
``latency_ms``/``strategy``/``model_version``) via
``logging_setup.get_logger``. Auto ``/docs`` comes from FastAPI.

``GET /metrics`` (todo 15, mounted from ``app/metrics.py``) — Prometheus
exposition: ``recsys_request_latency_seconds{route}``,
``recs_served_total{strategy,cold_start}``, ``bus_publish_failures``
gauge synced from the bus counter at scrape time.
``RECSYS_METRICS=off`` → 503 on ``/metrics`` only (serving unaffected).
"""

from __future__ import annotations

import json
import socket
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Response
from pydantic import BaseModel

from recommendation.app import baseline, bus, ranker, store
from recommendation.app.logging_setup import get_logger, setup_logging
from recommendation.app.metrics import (
    log_impression as _log_impression,
)
from recommendation.app.metrics import (
    observe_request as _observe_request,
)
from recommendation.app.metrics import router as metrics_router
from recommendation.app.schemas import (
    EventIn,
    RecResponse,
    SimilarResponse,
    Strategy,
)

setup_logging()

logger = get_logger("recommendation.app.main")

_MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
_VERSION_FILE = _MODELS_DIR / "current_version.txt"

# Todo 15: /metrics router (see recommendation/app/metrics.py).

app = FastAPI(title="recommendation-service")
app.include_router(metrics_router)


class EventAck(BaseModel):
    """202 acknowledgement for an ingested event."""

    status: str
    request_id: str


class HealthResponse(BaseModel):
    """Health envelope: dependency states + model pointer."""

    status: str
    kafka: str
    redis: str
    model_version: str


def current_model_version() -> str:
    """Return the version pointer, or ``"none"`` when missing/blank.

    Same file ``ranker`` reads, resolved relative to this file so any
    CWD works. Never raises.
    """
    try:
        text = _VERSION_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return "none"
    return text or "none"


def _kafka_status() -> str:
    """``"up"`` when the Kafka bootstrap host accepts TCP, else ``"down"``.

    A raw socket probe (1s timeout) — deliberately avoids building the
    cached producer so health checks have no side effects and never
    block on broker metadata.
    """
    try:
        from recommendation.app.config import load_settings

        bootstrap = load_settings().kafka_bootstrap
    except Exception:
        return "down"
    host_port = bootstrap.split(",")[0].strip()
    host, _, port = host_port.rpartition(":")
    try:
        with socket.create_connection((host or "localhost", int(port)), timeout=1.0):
            return "up"
    except Exception:
        return "down"


def _redis_status() -> str:
    """``"up"`` when Redis answers PING, else ``"down"`` (never raises)."""
    try:
        store.get_redis().ping()
    except Exception:
        return "down"
    return "up"


def _log_request(payload: dict[str, Any]) -> None:
    """Emit one JSON log line for a served request."""
    logger.info(json.dumps(payload))


@app.post("/events", response_model=EventAck, status_code=202)
def post_event(event: EventIn) -> EventAck:
    """Validate (422 on bad bodies) and queue an interaction event."""
    start = time.perf_counter()
    try:
        bus.publish_event(event)
        status = "queued"
    except bus.BusUnavailable:
        # Already spooled to local_buffer.jsonl by the bus — still 202.
        status = "queued-buffered"
    _log_request(
        {
            "route": "POST /events",
            "user_id": event.user_id,
            "count": 1,
            "latency_ms": round((time.perf_counter() - start) * 1000, 2),
            "strategy": None,
            "model_version": current_model_version(),
            "status": status,
        }
    )
    return EventAck(status=status, request_id=event.request_id)


@app.get("/recommendations/{user_id}", response_model=RecResponse)
def get_recommendations(
    user_id: str,
    response: Response,
    count: int = Query(default=20, ge=1, le=100),
    context: str = Query(default="homepage"),
    filter: str = Query(default=""),  # noqa: A002 — spec-mandated param name
) -> RecResponse:
    """Personalized recommendations with a HIT/MISS shared-nothing cache."""
    start = time.perf_counter()
    model_version = current_model_version()
    try:
        key = store.recs_key(user_id, context, filter, model_version)
    except ValueError as exc:
        # Hostile ids (":", SCAN glob chars) can never build a safe key —
        # 422, never an unhandled 500 (todo 13 hardening).
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    cached: RecResponse | None = None
    try:
        envelope = store.cache_get(key)
        if envelope is not None:
            try:
                cached = RecResponse(**envelope["data"])
            except Exception:
                cached = None  # wrong-shape entry: recompute below
    except store.CacheUnavailable:
        cached = None  # compute uncached

    if cached is not None:
        response.headers["X-Cache"] = "HIT"
        resp = cached
    else:
        data = ranker.rank(user_id, context=context, count=count, filter=filter)
        resp = RecResponse(**data)
        try:
            store.cache_set(key, resp.model_dump(mode="json"))
        except store.CacheUnavailable:
            pass  # best-effort: serve uncached rather than fail
        response.headers["X-Cache"] = "MISS"

    latency_s = time.perf_counter() - start
    latency_ms = round(latency_s * 1000, 2)
    try:
        _observe_request("/recommendations", latency_s, resp.strategy.value, resp.cold_start)
    except Exception:
        pass
    try:
        _log_impression(
            user_id=user_id,
            route="/recommendations",
            item_ids=[r.item_id for r in resp.recommendations],
            strategy=resp.strategy.value,
            model_version=resp.model_version,
            latency_ms=latency_ms,
        )
    except Exception:
        pass
    _log_request(
        {
            "route": "GET /recommendations/{user_id}",
            "user_id": user_id,
            "count": len(resp.recommendations),
            "latency_ms": latency_ms,
            "strategy": resp.strategy.value,
            "model_version": resp.model_version,
        }
    )
    return resp


@app.get("/similar/{item_id}", response_model=SimilarResponse)
def get_similar(
    item_id: str,
    response: Response,
    count: int = Query(default=10, ge=1, le=100),
) -> SimilarResponse:
    """Content-similar items (shareable cache — no user in the key)."""
    start = time.perf_counter()
    model_version = current_model_version()
    try:
        key = store.similar_key(item_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    cached: SimilarResponse | None = None
    try:
        envelope = store.cache_get(key)
        if envelope is not None:
            try:
                cached = SimilarResponse(**envelope["data"])
            except Exception:
                cached = None
    except store.CacheUnavailable:
        cached = None

    if cached is not None:
        response.headers["X-Cache"] = "HIT"
        resp = cached
    else:
        rows = baseline.content_similar(item_id, k=count)
        resp = SimilarResponse(
            items=rows,  # type: ignore[arg-type]
            model_version=model_version,
            strategy=Strategy.content,
        )
        try:
            store.cache_set(key, resp.model_dump(mode="json"))
        except store.CacheUnavailable:
            pass
        response.headers["X-Cache"] = "MISS"

    latency_s = time.perf_counter() - start
    latency_ms = round(latency_s * 1000, 2)
    try:
        _observe_request("/similar", latency_s, resp.strategy.value, False)
    except Exception:
        pass
    try:
        _log_impression(
            user_id=None,
            route="/similar",
            item_ids=[r.item_id for r in resp.items],
            strategy=resp.strategy.value,
            model_version=resp.model_version,
            latency_ms=latency_ms,
        )
    except Exception:
        pass
    _log_request(
        {
            "route": "GET /similar/{item_id}",
            "user_id": None,
            "count": len(resp.items),
            "latency_ms": latency_ms,
            "strategy": resp.strategy.value,
            "model_version": resp.model_version,
        }
    )
    return resp


@app.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    """Dependency states + model pointer (never 500 when deps are down)."""
    model_version = current_model_version()
    kafka = _kafka_status()
    redis_state = _redis_status()
    status = (
        "ok"
        if (kafka == "up" and redis_state == "up" and model_version != "none")
        else "degraded"
    )
    return HealthResponse(
        status=status, kafka=kafka, redis=redis_state, model_version=model_version
    )


__all__ = ["app", "current_model_version"]
