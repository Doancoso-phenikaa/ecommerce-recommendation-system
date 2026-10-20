"""Implicit ALS training pipeline (todo 9).

Pipeline::

    snapshot (SHARED lock, via consumer helper)
    -> validate rows (EventIn, skip unparseable — never train on DLQ rows)
    -> user x item CSR with EVENT_WEIGHTS confidence (bus.py, single source)
    -> AlternatingLeastSquares CPU fit
    -> models/als_{version}/ (model.npz + mappings.json)
    -> current_version.txt pointer (sole writer besides todo 16 retrain)
    -> delete models/snapshot_{version}/ (build artifact, keep tree lean)

Lock discipline: this module NEVER reads ``data/interactions.parquet`` or
``data/incoming/`` directly — it only calls
:func:`recommendation.app.consumer.snapshot_for_training`, which holds a
SHARED ``fcntl`` on ``data/.merge.lock`` while copying. Never take an
EXCLUSIVE lock here.

Scale rule: ``factors=16`` at seed scale, ``64`` ONLY when ``n_users > 1000``
(:func:`select_factors`). ``seed=42`` everywhere (numpy / random / implicit
``random_state``).

Import path for the todo 10 ranker::

    from recommendation.app.train_als import recommend

MLflow (todo 14): training logs a best-effort run to experiment ``"recsys"``
(file store ``recommendation/models/mlruns``). Browse it with::

    mlflow ui --backend-store-uri recommendation/models/mlruns

(run from the repo root; no network required). All MLflow calls are
wrapped try/except warn-not-crash — training exit codes never depend
on MLflow.
"""

from __future__ import annotations

import json
import math
import os
import random
import shutil
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix

from recommendation.app.bus import EVENT_WEIGHTS, event_weight
from recommendation.app.consumer import snapshot_for_training
from recommendation.app.schemas import EventType, EventValue, EventIn

__all__ = [
    "SEED",
    "ITERATIONS",
    "REGULARIZATION",
    "FACTORS_SMALL",
    "FACTORS_LARGE",
    "FACTORS_USER_THRESHOLD",
    "NoTrainingDataError",
    "select_factors",
    "load_snapshot_frame",
    "build_user_item_matrix",
    "train_model",
    "save_model",
    "load_model",
    "invalidate_model_cache",
    "recommend",
    "recommend_with_scores",
    "train",
]

#: Global seed used for numpy, random, and implicit random_state.
SEED = 42

#: ALS iterations (fixed per spec).
ITERATIONS = 20

#: ALS regularization (fixed per spec).
REGULARIZATION = 0.01

#: Factors at seed scale (users <= threshold).
FACTORS_SMALL = 16

#: Factors at production scale (users > threshold).
FACTORS_LARGE = 64

#: User-count threshold above which FACTORS_LARGE applies.
FACTORS_USER_THRESHOLD = 1000

MODELS_DIR = Path("recommendation") / "models"
"""Default model-output root (all writes stay inside ``recommendation/``)."""

#: MLflow experiment name (todo 14 — unified everywhere, train + eval).
MLFLOW_EXPERIMENT = "recsys"


def _resolve_models_dir(models_dir: Path | str | None = None) -> Path:
    """Resolve the model root, anchoring a relative path at the repo root.

    ``MODELS_DIR`` is repo-root-relative, so a bare relative default would
    otherwise resolve against the caller's CWD and silently fail to load a
    model the serving layer can see.
    """
    base = Path(models_dir) if models_dir is not None else MODELS_DIR
    if base.is_absolute():
        return base
    return Path(__file__).resolve().parents[2] / base


def _mlflow_tracking_uri(models_dir: Path | None = None) -> str:
    """Return a CWD-robust ``file:`` tracking URI for ``models_dir/mlruns``.

    Relative ``models_dir`` values are interpreted as repo-root-relative,
    absolute ones are used as-is.
    """
    try:
        mlruns = _resolve_models_dir(models_dir).resolve() / "mlruns"
    except Exception:
        mlruns = (Path.cwd() / Path(models_dir) / "mlruns").resolve()
    return "file:" + mlruns.as_posix()


class NoTrainingDataError(Exception):
    """Raised when the snapshot holds zero usable interactions."""


def select_factors(n_users: int) -> int:
    """Return ALS factors for ``n_users`` (64 ONLY when > 1000, else 16)."""
    return FACTORS_LARGE if n_users > FACTORS_USER_THRESHOLD else FACTORS_SMALL


def _clean(value: Any) -> Any:
    """Map NaN/NaT pandas sentinels to ``None``."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if value is pd.NaT:
        return None
    return value


def _row_to_event(row: dict[str, Any]) -> EventIn:
    """Validate one flat parquet row as :class:`EventIn` (raises if bad).

    DLQ/corrupt rows (unknown event type, missing ids, failed purchase
    revenue checks, ...) raise here and are skipped by the caller — never
    trained on.
    """
    event_type_raw = row.get("event_type")
    # `in EventType` raises TypeError on Python <= 3.11; the caller's
    # blanket `except` turns that into a silent "no training data".
    if not isinstance(event_type_raw, str) or event_type_raw not in EventType.__members__:
        raise ValueError(f"unknown event_type: {event_type_raw!r}")
    value = EventValue(
        rating=_clean(row.get("rating")),
        quantity=_clean(row.get("quantity")),
        unit_price_cents=_clean(row.get("unit_price_cents")),
        currency=_clean(row.get("currency")),
        query=_clean(row.get("query")),
    )
    # Drop empty value payloads so EventIn sees value=None.
    payload: dict[str, Any] = {
        "request_id": row.get("request_id"),
        "user_id": row.get("user_id"),
        "item_id": row.get("item_id"),
        "event_type": event_type_raw,
        "timestamp": row.get("timestamp"),
        "session_id": _clean(row.get("session_id")),
    }
    if (
        value.rating is not None
        or value.quantity is not None
        or value.unit_price_cents is not None
        or value.currency is not None
        or value.query is not None
    ):
        payload["value"] = value
    return EventIn.model_validate(payload)


def load_snapshot_frame(snapshot_dir: Path) -> pd.DataFrame:
    """Read the snapshot's parquet files into one deduped frame.

    Reads ONLY ``snapshot_dir`` (never live ``data/``): the snapshot's
    ``interactions.parquet`` plus ``incoming/batch_*.parquet``. Dedups on
    ``request_id`` (keep last), mirroring the compactor.
    """
    frames: list[pd.DataFrame] = []
    interactions = snapshot_dir / "interactions.parquet"
    if interactions.exists():
        frames.append(pd.read_parquet(interactions))
    incoming = snapshot_dir / "incoming"
    if incoming.is_dir():
        for path in sorted(incoming.glob("batch_*.parquet")):
            frames.append(pd.read_parquet(path))
    if not frames:
        return pd.DataFrame()
    merged = (
        pd.concat(frames, ignore_index=True)
        if len(frames) > 1
        else frames[0].copy()
    )
    if "request_id" in merged.columns:
        merged = merged.drop_duplicates(subset=["request_id"], keep="last")
    return merged


def build_user_item_matrix(
    frame: pd.DataFrame,
) -> tuple[csr_matrix, list[str], list[str], int]:
    """Build a user x item CSR confidence matrix from a snapshot frame.

    Each row is validated via :class:`EventIn` (unparseable rows skipped);
    confidence comes from :func:`event_weight` (``EVENT_WEIGHTS`` single
    source of truth; rating events use the clamped value). Duplicate
    (user, item) pairs sum their confidences. Ids are sorted for
    determinism.

    Returns ``(matrix, user_ids, item_ids, n_interactions)`` where
    ``n_interactions`` is the validated-row count. Raises
    :class:`NoTrainingDataError` (message ``"no training data"``) when no
    usable interaction survives validation.
    """
    weights: dict[tuple[str, str], float] = {}
    n_valid = 0
    if frame is not None and not frame.empty:
        records = frame.to_dict(orient="records")
        for row in records:
            try:
                if not isinstance(row, dict):
                    raise ValueError("row is not a mapping")
                user_id = row.get("user_id")
                item_id = row.get("item_id")
                if not user_id or not item_id:
                    raise ValueError("missing user_id/item_id")
                event = _row_to_event(row)
            except Exception:
                continue  # DLQ/corrupt row — skip, never train on it.
            key = (str(event.user_id), str(event.item_id))
            weights[key] = weights.get(key, 0.0) + float(event_weight(event))
            n_valid += 1
    if n_valid == 0 or not weights:
        raise NoTrainingDataError("no training data")
    user_ids = sorted({u for u, _ in weights})
    item_ids = sorted({i for _, i in weights})
    user_index = {u: k for k, u in enumerate(user_ids)}
    item_index = {i: k for k, i in enumerate(item_ids)}
    rows = np.array([user_index[u] for u, _ in weights], dtype=np.int32)
    cols = np.array([item_index[i] for _, i in weights], dtype=np.int32)
    data = np.array(list(weights.values()), dtype=np.float32)
    matrix = csr_matrix(
        (data, (rows, cols)),
        shape=(len(user_ids), len(item_ids)),
        dtype=np.float32,
    )
    return matrix, user_ids, item_ids, n_valid


def train_model(
    user_items: csr_matrix,
    factors: int,
    seed: int = SEED,
    iterations: int = ITERATIONS,
    regularization: float = REGULARIZATION,
) -> Any:
    """Fit a CPU :class:`AlternatingLeastSquares` on ``user_items``.

    Seeds ``numpy``/``random`` plus implicit ``random_state``; forces
    single-threaded OpenBLAS for determinism.
    """
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
    try:
        from threadpoolctl import threadpool_limits  # type: ignore

        threadpool_limits(limits=1, user_api="blas")
    except Exception:
        pass
    random.seed(seed)
    np.random.seed(seed)
    # implicit.als.AlternatingLeastSquares dispatches to CPU/GPU; with
    # use_gpu=False the result is an implicit.cpu.als instance.
    from implicit.als import AlternatingLeastSquares

    model = AlternatingLeastSquares(
        factors=factors,
        regularization=regularization,
        iterations=iterations,
        random_state=seed,
        use_gpu=False,
    )
    model.fit(user_items)
    return model


def save_model(
    model: Any,
    model_dir: Path,
    user_ids: list[str],
    item_ids: list[str],
    factors: int,
    seed: int,
    n_interactions: int,
) -> Path:
    """Persist ``model.npz`` (implicit save) + ``mappings.json`` metadata."""
    model_dir.mkdir(parents=True, exist_ok=True)
    model.save(str(model_dir / "model.npz"))
    mappings = {
        "user_ids": list(user_ids),
        "item_ids": list(item_ids),
        "factors": factors,
        "seed": seed,
        "n_users": len(user_ids),
        "n_items": len(item_ids),
        "n_interactions": n_interactions,
    }
    with open(model_dir / "mappings.json", "w", encoding="utf-8") as fh:
        json.dump(mappings, fh, indent=2)
    return model_dir


@lru_cache(maxsize=2)
def _load_model_cached(model_dir: str) -> tuple[Any, dict[str, Any]]:
    from implicit.cpu.als import AlternatingLeastSquares

    model = AlternatingLeastSquares.load(str(Path(model_dir) / "model.npz"))
    with open(Path(model_dir) / "mappings.json", encoding="utf-8") as fh:
        mappings = json.load(fh)
    return model, mappings


def load_model(model_dir: Path | str) -> tuple[Any, dict[str, Any]]:
    """Load the ALS model + mappings, cached on the resolved directory.

    Deserialising ``model.npz`` per request dominated serving cost. The
    cache key is the resolved model directory, so a retrain that rotates
    ``current_version.txt`` resolves to a new directory and loads the new
    model -- the stale entry is evicted by ``maxsize=2``. Call
    :func:`invalidate_model_cache` when a model directory is overwritten
    in place.

    The import is deliberately function-local: ``implicit.als`` exposes a
    factory while ``implicit.cpu.als`` exposes the concrete class, and
    only the latter has the ``.load`` classmethod.
    """
    return _load_model_cached(str(Path(model_dir).resolve()))


def invalidate_model_cache() -> None:
    """Drop cached ALS models (call after overwriting a model dir in place)."""
    _load_model_cached.cache_clear()


def recommend_with_scores(
    user_id: str,
    n: int = 10,
    model_dir: Path | str | None = None,
    seen_item_ids: set[str] | None = None,
) -> list[tuple[str, float]]:
    """Return up to ``n`` ``(item_id, score)`` pairs, highest score first.

    The raw ALS dot-product is returned: the ranker needs model
    confidence, not rank position. ``seen_item_ids`` is passed to
    ``model.recommend`` as a filter row so already-consumed items never
    consume the candidate budget. ``None`` disables filtering (the
    previous behaviour, in which the caller filtered afterwards).

    Raises :class:`KeyError` for a user absent from the model's
    ``mappings["user_ids"]`` — cold start is the caller's job.
    """
    base = Path(model_dir) if model_dir is not None else _current_model_dir()
    model, mappings = load_model(base)
    user_ids: list[str] = list(mappings["user_ids"])
    item_ids: list[str] = list(mappings["item_ids"])
    if user_id not in user_ids:
        raise KeyError(f"unknown user_id: {user_id!r}")
    internal = user_ids.index(user_id)
    n_items = len(item_ids)

    if seen_item_ids:
        # 1.0 marks "do not recommend"; implicit treats non-zero as filtered.
        filtered = [iid for iid in seen_item_ids if iid in item_ids]
        row = np.zeros((1, n_items), dtype=np.float32)
        for iid in filtered:
            row[0, item_ids.index(iid)] = 1.0
        filter_row = csr_matrix(row)
    else:
        filtered = []
        filter_row = csr_matrix((1, n_items), dtype=np.float32)

    # implicit emits -inf for any filtered item it is *forced* to return, so N
    # must not exceed the unfiltered count or seen ids leak back with a
    # sentinel score. N <= 0 crashes implicit's topk, hence the empty return:
    # a user who consumed everything is the caller's never-empty case.
    want = min(int(n), n_items - len(filtered))
    if want <= 0:
        return []
    ids, scores = model.recommend(internal, filter_row, N=want)
    pairs = [(item_ids[int(i)], float(scores[j])) for j, i in enumerate(ids)]
    pairs.sort(key=lambda t: (-t[1], t[0]))
    return pairs[:want]


def recommend(
    user_id: str, n: int = 10, model_dir: Path | str | None = None
) -> list[str]:
    """Return up to ``n`` item ids for ``user_id``.

    Import path: ``from recommendation.app.train_als import recommend``.
    Contract unchanged: ids only, no seen-item filtering, ``KeyError``
    for an unknown user. Thin wrapper over
    :func:`recommend_with_scores`.
    """
    return [i for i, _ in recommend_with_scores(user_id, n=n, model_dir=model_dir)]


def _current_model_dir(models_dir: Path | None = None) -> Path:
    """Resolve the ``current_version.txt`` pointer to its ``als_*`` dir.

    ``None`` means "use :data:`MODELS_DIR`", read at call time so tests and
    callers can redirect it.
    """
    base = _resolve_models_dir(models_dir)
    pointer = base / "current_version.txt"
    version = pointer.read_text(encoding="utf-8").strip()
    return base / f"als_{version}"


def log_mlflow_best_effort(
    params: dict[str, Any],
    metrics: dict[str, Any],
    model_dir: Path | str | None = None,
    run_name: str | None = None,
    models_dir: Path | None = None,
) -> None:
    """Log ``params``/``metrics`` (+ ``mappings.json``) to MLflow; warn, never crash.

    Experiment ``"recsys"`` (todo 14 unification; the old ``"als-training"``
    name is retired). Tracking URI is CWD-robust (derived from
    ``models_dir`` via :func:`_mlflow_tracking_uri`). Extra kwargs are
    optional so existing callers keep working. Training exit codes never
    depend on this function.
    """
    try:
        import mlflow

        # File store is in maintenance mode upstream; opt in so the
        # hook actually logs. Still best-effort (try/except).
        os.environ.setdefault("MLFLOW_ALLOW_FILE_STORE", "true")
        mlflow.set_tracking_uri(_mlflow_tracking_uri(models_dir))
        mlflow.set_experiment(MLFLOW_EXPERIMENT)
        with mlflow.start_run(run_name=run_name):
            mlflow.log_params({k: v for k, v in params.items()})
            mlflow.log_metrics({k: float(v) for k, v in metrics.items()})
            if model_dir is not None:
                mappings = Path(model_dir) / "mappings.json"
                if mappings.is_file():
                    mlflow.log_artifact(str(mappings), artifact_path="")
    except Exception as exc:
        print(f"warning: mlflow logging skipped ({exc})", file=sys.stderr)


def train(
    version: str, models_dir: Path | None = None, *, update_pointer: bool = True
) -> dict[str, Any]:
    """Run the full pipeline for ``version``; return a stats dict.

    Snapshots via :func:`snapshot_for_training` into
    ``models/snapshot_{version}/`` (SHARED lock, trainer reads the snapshot
    only), builds the CSR, fits ALS, saves ``models/als_{version}/``,
    writes the ``current_version.txt`` pointer, then DELETES the snapshot
    dir. Raises :class:`NoTrainingDataError` on empty snapshots (the CLI
    maps it to exit 2). The snapshot dir is also removed on the
    no-data path so no snapshot dirs are ever left behind.

    ``update_pointer=False`` skips the pointer write so a caller that
    gates the model afterwards (see ``scripts/retrain.sh``) can promote it
    only once the gate passes. Writing it here would expose the ungated
    model to live traffic in the window between train and verdict.
    """
    models_dir = _resolve_models_dir(models_dir)
    snapshot_dir = models_dir / f"snapshot_{version}"
    model_dir = models_dir / f"als_{version}"
    snapshot_for_training(snapshot_dir)
    try:
        frame = load_snapshot_frame(snapshot_dir)
        user_items, user_ids, item_ids, n_interactions = build_user_item_matrix(
            frame
        )
    except NoTrainingDataError:
        shutil.rmtree(snapshot_dir, ignore_errors=True)
        raise
    factors = select_factors(len(user_ids))
    model = train_model(user_items, factors=factors, seed=SEED)
    save_model(
        model,
        model_dir,
        user_ids,
        item_ids,
        factors=factors,
        seed=SEED,
        n_interactions=n_interactions,
    )
    if update_pointer:
        (models_dir / "current_version.txt").write_text(
            f"{version}\n", encoding="utf-8"
        )
    stats = {
        "version": version,
        "factors": factors,
        "seed": SEED,
        "iterations": ITERATIONS,
        "regularization": REGULARIZATION,
        "n_users": len(user_ids),
        "n_items": len(item_ids),
        "n_interactions": n_interactions,
        "coverage_pairs": int(user_items.nnz),
        "model_dir": str(model_dir),
    }
    log_mlflow_best_effort(
        {
            "version": version,
            "factors": factors,
            "seed": SEED,
            "iterations": ITERATIONS,
            "regularization": REGULARIZATION,
        },
        {
            "n_users": len(user_ids),
            "n_items": len(item_ids),
            "n_interactions": n_interactions,
        },
        model_dir=model_dir,
        run_name=f"train-{version}",
        models_dir=models_dir,
    )
    shutil.rmtree(snapshot_dir, ignore_errors=True)
    return stats
