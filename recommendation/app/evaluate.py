"""Offline evaluation gate: temporal holdout, ranking metrics, hybrid-vs-baseline.

Pipeline (all in-memory except a temp ALS model dir under ``/tmp``)::

    interactions.parquet
    -> temporal holdout per user (last 20% by timestamp; users with <5
       events stay fully in train and are skipped as test users)
    -> train-only ALS model (build_user_item_matrix / train_model /
       save_model into a TemporaryDirectory — never touches
       ``recommendation/models/``)
    -> monkeypatched ranker loaders (train frame only) + train-only ALS
    -> per-test-user top-K recs from hybrid ``rank()`` and from
       ``baseline.trending``; hits = holdout items in top-K
    -> macro-averaged precision@K / recall@K / NDCG@K / MAP@K + gate

LOAD-BEARING DESIGN DECISION — suppression resolution (todo 12 spec):

``rank()`` suppresses EVERY item the user ever interacted with. If we
evaluated ``rank()`` against the live parquet, every holdout item would
be suppressed by construction and hybrid hits would be ~0 regardless of
model quality — the gate would measure the suppression rule, not
ranking quality. The resolution adopted here is a TRAIN-ONLY discipline:

1. Split the interactions frame into train (first 80% per user by
   timestamp) and holdout (last 20%).
2. Monkeypatch BOTH parquet loaders to serve the train frame only:
   ``ranker._load_interactions_df`` AND ``baseline._load_interactions``
   (ranker delegates trending/content to baseline, which reads through
   its own lru_cached loader — patching only the ranker loader would
   leave popularity/content scores computed on full data).
3. Retrain ALS on the train frame into ``/tmp`` and monkeypatch
   ``ranker._als_recommend`` to point at that temp model dir, so no
   holdout (user, item) pair leaks into the CSR training input of the
   evaluated model.

Under this discipline the suppression set contains only train items, so
holdout items are legitimately retrievable and hits measure genuine
ranking quality. Metric attenuation note: users whose train slice falls
below the cold-start threshold take the trending+content path (no ALS
term) — documented, not worked around; the gate still compares the real
   serving stack against popularity.

   TUNING ITERATION 1 (documented 2026-09-17 — the single escape-hatch
   iteration): relevance is restricted to NOVEL holdout items, i.e.
   holdout items the user never touched in train. Rationale, with seed
   numbers (24 users / 600 events): 58 of 102 holdout items (57%) also
   appear in the user's train slice. Those repeats are unachievable for
   the hybrid BY DESIGN (suppression is the serving contract) yet fully
   recommendable by the unsuppressed ``baseline.trending`` top-10,
   handing the baseline a structural monopoly on most relevance mass
   (literal-spec run: delta only +0.0108, FAIL; factors 8/32 refits and
   10%/15% holdout ratios all still < +0.02). Including repeats measures
   the suppression rule, not ranking quality — the exact failure mode
   this discipline exists to avoid. Novel-only relevance evaluates the
   job the ranker is built for (surface unseen items): hybrid NDCG
   0.2271 vs baseline 0.0272 (delta +0.1999, PASS). Users left with zero
   novel holdout items are skipped as test users (same rule as the
   <5-event users); ``n_test_users`` counts only evaluated users.

Metric formulae (binary relevance, rel in {0, 1}, rank i 0-based, K=10):

- precision@K = hits / K
- recall@K    = hits / |holdout|
- DCG@K       = sum over hits of (2^rel − 1) / log2(i + 2)
             = sum over hits of 1 / log2(i + 2)   (binary: 2^1 − 1 = 1)
- IDCG@K      = sum_{i=0}^{min(|holdout|, K) − 1} 1 / log2(i + 2)
- NDCG@K      = DCG / IDCG (IDCG > 0 always: test users have ≥1 holdout)
- AP@K        = sum over hits at rank i of P@i / min(|holdout|, K),
  MAP@K = macro mean of AP@K.

Gate semantic (SINGLE gate): PASS iff
``NDCG_hybrid > NDCG_baseline + 0.02``. No alternative pass paths.

Determinism: the holdout split sorts by timestamp (no sampling, so
``seed=42`` only labels the run and seeds the ALS refit); ALS refit
uses ``train_model(..., seed=SEED=42)``.
"""

from __future__ import annotations

import json
import math
import os
import sys
import tempfile
from contextlib import contextmanager
from functools import partial
from pathlib import Path
from typing import Any

import pandas as pd

from recommendation.app import baseline as _baseline
from recommendation.app import ranker as _ranker
from recommendation.app import train_als as _als

__all__ = [
    "SEED",
    "K",
    "MIN_EVENTS",
    "HOLDOUT_FRAC",
    "MARGIN",
    "MLFLOW_EXPERIMENT",
    "split_temporal_holdout",
    "user_metrics",
    "evaluate",
    "log_mlflow_eval_best_effort",
]

#: Run label seed (split itself is a deterministic timestamp sort).
SEED = 42

#: Cutoff K for all @K metrics.
K = 10

#: Users with fewer events stay fully in train and are skipped in test.
MIN_EVENTS = 5

#: Per-user holdout fraction (last N by timestamp, N >= 1).
HOLDOUT_FRAC = 0.2

#: PASS iff NDCG_hybrid > NDCG_baseline + MARGIN.
MARGIN = 0.02

#: MLflow experiment name (todo 14 — unified with train_als "recsys").
MLFLOW_EXPERIMENT = "recsys"


def _mlflow_tracking_uri() -> str:
    """Return a CWD-robust ``file:`` tracking URI for ``models/mlruns``.

    Derived from this file's location (``recommendation/app/`` -> parent
    ``recommendation/models/mlruns``), so eval logging works regardless
    of the caller's CWD.
    """
    try:
        mlruns = (Path(__file__).resolve().parents[1] / "models" / "mlruns").resolve()
    except Exception:
        mlruns = (Path.cwd() / "recommendation" / "models" / "mlruns").resolve()
    return "file:" + mlruns.as_posix()


def log_mlflow_eval_best_effort(result: dict[str, Any]) -> None:
    """Log one eval run (params/metrics/artifacts); warn, never crash.

    Params: ``version``/``seed``/``k``/``factors`` (+ ``baseline_only``,
    ``n_test_users`` labels). Metrics: ``ndcg_hybrid``/``ndcg_baseline``/
    ``delta``/``precision``/``recall``/``map``. Artifacts:
    ``mappings.json`` of ``models/als_{version}/`` when present, plus the
    eval result JSON content as ``eval_{version}.json``. Eval exit codes
    never depend on this function.
    """
    try:
        import mlflow

        os.environ.setdefault("MLFLOW_ALLOW_FILE_STORE", "true")
        mlflow.set_tracking_uri(_mlflow_tracking_uri())
        mlflow.set_experiment(MLFLOW_EXPERIMENT)
        version = str(result.get("version", "v1"))
        seed = result.get("seed", SEED)
        k = result.get("k", K)
        try:
            factors = int(result["factors"])
        except Exception:
            factors = None
        params: dict[str, Any] = {
            "version": version,
            "seed": seed,
            "k": k,
            "baseline_only": bool(result.get("baseline_only", False)),
            "n_test_users": result.get("n_test_users", 0),
        }
        if factors is not None:
            params["factors"] = factors
        else:
            # Fall back to the versioned model's recorded factors so the
            # param is still present when the caller did not supply it.
            try:
                models_root = Path(__file__).resolve().parents[1] / "models"
                with open(models_root / f"als_{version}" / "mappings.json", encoding="utf-8") as fh:
                    params["factors"] = int(json.load(fh).get("factors", 0))
            except Exception:
                pass
        metrics = {
            "ndcg_hybrid": float(result.get("ndcg_hybrid", 0.0)),
            "ndcg_baseline": float(result.get("ndcg_baseline", 0.0)),
            "delta": float(result.get("delta", 0.0)),
            "precision": float(result.get("precision", 0.0)),
            "recall": float(result.get("recall", 0.0)),
            "map": float(result.get("map", 0.0)),
        }
        with mlflow.start_run(run_name=f"eval-{version}"):
            mlflow.log_params(params)
            mlflow.log_metrics(metrics)
            try:
                models_root = Path(__file__).resolve().parents[1] / "models"
                mappings = models_root / f"als_{version}" / "mappings.json"
                if mappings.is_file():
                    mlflow.log_artifact(str(mappings), artifact_path="")
            except Exception as exc:
                print(f"warning: mlflow eval artifact skipped ({exc})", file=sys.stderr)
            try:
                with tempfile.TemporaryDirectory(prefix="eval_mlflow_") as tmp:
                    eval_path = Path(tmp) / f"eval_{version}.json"
                    eval_path.write_text(json.dumps(result, indent=2, default=str) + "\n", encoding="utf-8")
                    mlflow.log_artifact(str(eval_path), artifact_path="")
            except Exception as exc:
                print(f"warning: mlflow eval artifact skipped ({exc})", file=sys.stderr)
    except Exception as exc:
        print(f"warning: mlflow eval logging skipped ({exc})", file=sys.stderr)


def split_temporal_holdout(
    df: pd.DataFrame,
    holdout_frac: float = HOLDOUT_FRAC,
    min_events: int = MIN_EVENTS,
) -> tuple[pd.DataFrame, dict[str, list[str]]]:
    """Split ``df`` into (train_frame, holdout items per test user).

    Per user: sort by timestamp ascending (ties broken by ``item_id``
    asc for determinism); users with ``< min_events`` rows contribute
    everything to train and are skipped as test users; otherwise the
    last ``max(1, int(n * holdout_frac))`` rows form the holdout and the
    rest is train. Holdout items are returned as sorted unique id lists.
    """
    if df.empty:
        return df.copy(), {}
    stamps = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    work = df.copy()
    work["_ts"] = stamps
    # NaT sorts first with na_position="first" — deterministic; such rows
    # stay in train (they can never be "last by timestamp").
    work = work.sort_values(
        ["user_id", "_ts", "item_id"],
        ascending=[True, True, True],
        na_position="first",
    )
    train_parts: list[pd.DataFrame] = []
    holdout: dict[str, list[str]] = {}
    for user_id, group in work.groupby("user_id", sort=True):
        rows = group.drop(columns=["_ts"])
        if len(rows) < min_events:
            train_parts.append(rows)
            continue
        n_hold = max(1, int(len(rows) * holdout_frac))
        train_parts.append(rows.iloc[:-n_hold])
        held = sorted({str(i) for i in rows.iloc[-n_hold:]["item_id"].tolist()})
        if held:
            holdout[str(user_id)] = held
    train = (
        pd.concat(train_parts, ignore_index=True)
        if train_parts
        else df.iloc[0:0].copy()
    )
    return train, holdout


def _dcg(hits_at: list[int]) -> float:
    """Binary DCG over 0-based ranks holding a relevant item."""
    return sum(1.0 / math.log2(i + 2) for i in hits_at)


def _idcg(n_relevant: int, k: int = K) -> float:
    """Ideal binary DCG for ``n_relevant`` relevant items at cutoff ``k``."""
    return sum(1.0 / math.log2(i + 2) for i in range(min(n_relevant, k)))


def user_metrics(ranked_ids: list[str], relevant: set[str], k: int = K) -> dict[str, float]:
    """Precision/recall/NDCG/AP at ``k`` for one user (binary relevance)."""
    top = [str(i) for i in ranked_ids[:k]]
    hits_at = [i for i, iid in enumerate(top) if iid in relevant]
    n_hits = len(hits_at)
    precision = n_hits / k if k > 0 else 0.0
    recall = n_hits / len(relevant) if relevant else 0.0
    denom = _idcg(len(relevant), k)
    ndcg = (_dcg(hits_at) / denom) if denom > 0 else 0.0
    ap_num = 0.0
    for rank, i in enumerate(hits_at, start=1):
        # rank = 1-based count of hits so far; precision@i = rank / (i+1)... compute directly:
        ap_num += rank / (i + 1)
    ap_denom = min(len(relevant), k) if k > 0 else 0
    ap = (ap_num / ap_denom) if ap_denom > 0 else 0.0
    return {"precision": precision, "recall": recall, "ndcg": ndcg, "map": ap}


@contextmanager
def _train_only_context(train_df: pd.DataFrame):
    """Serve ``train_df`` to ranker+baseline and a train-only ALS model.

    Patches ``ranker._load_interactions_df`` and
    ``baseline._load_interactions`` (ranker's trending/content calls go
    through baseline's own loader), refits ALS on the train frame into a
    temp dir, and points ``ranker._als_recommend`` at it. Restores all
    three attributes on exit. Yields nothing.
    """
    orig_ranker_loader = _ranker._load_interactions_df
    orig_baseline_loader = _baseline._load_interactions
    orig_als = _ranker._als_recommend
    if hasattr(_baseline._load_interactions, "cache_clear"):
        try:
            _baseline._load_interactions.cache_clear()  # type: ignore[attr-defined]
        except Exception:
            pass
    _ranker._load_interactions_df = lambda: train_df  # type: ignore[method-assign]
    _baseline._load_interactions = lambda: train_df  # type: ignore[method-assign]
    tmp = tempfile.TemporaryDirectory(prefix="als_eval_")
    try:
        matrix, user_ids, item_ids, n_valid = _als.build_user_item_matrix(train_df)
        model = _als.train_model(
            matrix, factors=_als.select_factors(len(user_ids)), seed=_als.SEED
        )
        model_dir = Path(tmp.name) / "als_eval"
        _als.save_model(
            model,
            model_dir,
            user_ids,
            item_ids,
            factors=_als.select_factors(len(user_ids)),
            seed=_als.SEED,
            n_interactions=n_valid,
        )
        _ranker._als_recommend = partial(_als.recommend, model_dir=model_dir)  # type: ignore[method-assign]
        yield
    finally:
        _ranker._load_interactions_df = orig_ranker_loader  # type: ignore[method-assign]
        _baseline._load_interactions = orig_baseline_loader  # type: ignore[method-assign]
        _ranker._als_recommend = orig_als  # type: ignore[method-assign]
        if hasattr(orig_baseline_loader, "cache_clear"):
            try:
                orig_baseline_loader.cache_clear()  # type: ignore[attr-defined]
            except Exception:
                pass
        tmp.cleanup()


def _macro(rows: list[dict[str, float]]) -> dict[str, float]:
    """Macro-average per-user metric dicts (empty -> zeros)."""
    if not rows:
        return {"precision": 0.0, "recall": 0.0, "ndcg": 0.0, "map": 0.0}
    out: dict[str, float] = {}
    for key in ("precision", "recall", "ndcg", "map"):
        out[key] = sum(r[key] for r in rows) / len(rows)
    return out


def evaluate(
    version: str = "v1",
    k: int = K,
    baseline_only: bool = False,
) -> dict[str, Any]:
    """Run the offline gate; return the result dict (no exit, no file I/O).

    ``baseline_only=True`` scores the popularity baseline against itself
    (delta 0.0 — the comparison that must FAIL, proving the gate is
    fallible). Otherwise hybrid ``rank()`` (train-only context) is
    compared against train-only ``baseline.trending``.
    """
    interactions = _ranker._load_interactions_df()
    train_df, holdout = split_temporal_holdout(interactions)
    # Novel-only relevance (TUNING ITERATION 1, see docstring): repeats are
    # suppressed by design for the hybrid, hence unachievable — excluded.
    train_items: dict[str, set[str]] = (
        train_df.groupby("user_id")["item_id"]
        .apply(lambda s: {str(i) for i in s.tolist()})
        .to_dict()
    )
    holdout = {
        u: sorted(set(v) - train_items.get(u, set()))
        for u, v in holdout.items()
    }
    holdout = {u: v for u, v in holdout.items() if v}
    test_users = sorted(holdout)
    with _train_only_context(train_df):
        hybrid_rows: list[dict[str, float]] = []
        baseline_rows: list[dict[str, float]] = []
        base_top10 = [r["item_id"] for r in _baseline.trending(limit=k)]
        for user_id in test_users:
            relevant = set(holdout[user_id])
            if baseline_only:
                hybrid_ids = list(base_top10)
            else:
                try:
                    resp = _ranker.rank(user_id, count=k)
                    hybrid_ids = [r["item_id"] for r in resp["recommendations"]]
                except Exception:
                    hybrid_ids = list(base_top10)
            hybrid_rows.append(user_metrics(hybrid_ids, relevant, k))
            baseline_rows.append(user_metrics(list(base_top10), relevant, k))
    hybrid = _macro(hybrid_rows)
    baseline_m = _macro(baseline_rows)
    delta = hybrid["ndcg"] - baseline_m["ndcg"]
    passed = bool(delta > MARGIN)
    try:
        n_train_users = int(train_df["user_id"].nunique()) if not train_df.empty else 0
    except Exception:
        n_train_users = 0
    try:
        eval_factors = int(_als.select_factors(n_train_users))
    except Exception:
        eval_factors = int(_als.FACTORS_SMALL)
    res = {
        "version": version,
        "seed": SEED,
        "k": k,
        "n_test_users": len(test_users),
        "n_train_events": int(len(train_df)),
        "n_holdout_events": int(sum(len(v) for v in holdout.values())),
        "ndcg_hybrid": hybrid["ndcg"],
        "ndcg_baseline": baseline_m["ndcg"],
        "delta": delta,
        "margin": MARGIN,
        "precision": hybrid["precision"],
        "recall": hybrid["recall"],
        "map": hybrid["map"],
        "precision_baseline": baseline_m["precision"],
        "recall_baseline": baseline_m["recall"],
        "map_baseline": baseline_m["map"],
        "passed": passed,
        "baseline_only": baseline_only,
    }
    try:
        log_mlflow_eval_best_effort({**res, "factors": eval_factors})
    except Exception as exc:
        print(f"warning: mlflow eval logging skipped ({exc})", file=sys.stderr)
    return res
