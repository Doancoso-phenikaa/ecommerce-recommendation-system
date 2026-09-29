"""Tests for :mod:`recommendation.app.evaluate` (todo 14, the offline gate).

Covers the per-user temporal holdout split, the hand-checkable ranking
metrics (precision/recall/NDCG/AP at K), the macro average, the hybrid-vs-
baseline result shape, the gate being *fallible* (baseline-only must fail),
and the best-effort MLflow eval logging.

Hermetic: the parquet loaders and ``train_als.MODELS_DIR`` are redirected
into ``tmp_path`` by ``write_parquet()``, the ALS refit inside
``evaluate`` lands in its own ``TemporaryDirectory``, and the eval tracking
URI is monkeypatched to a ``tmp_path`` file store so
``recommendation/models/mlruns`` is never written.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from recommendation.app import evaluate
from recommendation.app import oracle as oracle_mod


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


_CONFTEST = _load_conftest()
EVENTS_FRAME = _CONFTEST.EVENTS_FRAME


def _tmp_tracking_uri(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Pin the eval MLflow file store to ``tmp_path`` and return its root."""
    store = tmp_path / "mlruns"
    monkeypatch.setenv("MLFLOW_TRACKING_URI", str(store))
    monkeypatch.setenv("MLFLOW_ALLOW_FILE_STORE", "true")
    monkeypatch.setattr(
        evaluate, "_mlflow_tracking_uri", lambda: "file:" + store.as_posix()
    )
    return store


# --------------------------------------------------------------------------
# split_temporal_holdout
# --------------------------------------------------------------------------


def test_split_holdout_is_last_by_timestamp(events_frame: pd.DataFrame) -> None:
    train, holdout = evaluate.split_temporal_holdout(events_frame)
    # user-001 has 6 events -> int(6 * 0.2) = 1 holdout row.
    # user-002 (3) and user-003 (1) are below MIN_EVENTS: they now
    # contribute all-but-one event to train and their last event to holdout.
    assert set(holdout) == {"user-001", "user-002", "user-003"}
    assert holdout["user-001"] == ["boo-003"]  # 10 days ago = the latest event
    assert len(train) == 7
    assert "user-001" in set(train["user_id"])
    assert "boo-003" not in set(
        train.loc[train["user_id"] == "user-001", "item_id"]
    )
    # Cold-start users each keep all but their last event in train.
    assert len(train.loc[train["user_id"] == "user-002"]) == 2
    assert len(train.loc[train["user_id"] == "user-003"]) == 0

    # Ties on timestamp break on item_id asc, so the split stays deterministic.
    _, again = evaluate.split_temporal_holdout(events_frame.sample(frac=1.0, random_state=3))
    assert again == holdout

    empty_train, empty_holdout = evaluate.split_temporal_holdout(pd.DataFrame())
    assert empty_train.empty and empty_holdout == {}


def test_split_sizes_and_train_only_users() -> None:
    rows = []
    for user, n in (("u-big", 10), ("u-edge", 5), ("u-small", 4)):
        for i in range(n):
            rows.append(
                {
                    "user_id": user,
                    "item_id": f"{user}-i{i:02d}",
                    "event_type": "view",
                    "timestamp": f"2026-01-{i + 1:02d}T00:00:00+00:00",
                }
            )
    frame = pd.DataFrame(rows)
    train, holdout = evaluate.split_temporal_holdout(frame)

    assert evaluate.MIN_EVENTS == 5
    assert evaluate.HOLDOUT_FRAC == 0.2
    # max(1, int(n * 0.2)): 10 -> 2, 5 -> 1, 4 -> cold user, holds out 1.
    assert len(holdout["u-big"]) == 2
    assert len(holdout["u-edge"]) == 1
    assert holdout["u-small"] == ["u-small-i03"]  # last by timestamp
    assert holdout["u-big"] == ["u-big-i08", "u-big-i09"]
    assert holdout["u-edge"] == ["u-edge-i04"]
    assert len(train) == 15
    per_user = train.groupby("user_id").size().to_dict()
    assert per_user == {"u-big": 8, "u-edge": 4, "u-small": 3}

    # A larger holdout fraction moves the cut, still keeping >= 1 row.
    _, wide = evaluate.split_temporal_holdout(frame, holdout_frac=0.5)
    assert len(wide["u-big"]) == 5
    # A stricter min_events promotes BOTH the 5-event and the 4-event user
    # to the cold-start branch; each holds out its single last event.
    _, strict = evaluate.split_temporal_holdout(frame, min_events=6)
    assert set(strict) == {"u-big", "u-edge", "u-small"}
    assert strict["u-edge"] == ["u-edge-i04"]
    assert strict["u-small"] == ["u-small-i03"]


# --------------------------------------------------------------------------
# user_metrics / macro average
# --------------------------------------------------------------------------


def test_user_metrics_hand_computed() -> None:
    """Hand-computed case, no reference to the implementation.

    k=4, ranked = [a, x, b, y], relevant = {a, b}.

    hits sit at 0-based ranks 0 and 2.
      precision@4 = 2/4                         = 0.5
      recall@4    = 2/2                         = 1.0
      DCG@4       = 1/log2(2) + 1/log2(4)       = 1 + 0.5 = 1.5
      IDCG@4      = 1/log2(2) + 1/log2(3)
                  = 1 + 0.6309297535714574      = 1.6309297535714574
      NDCG@4      = 1.5 / 1.6309297535714574    = 0.9197207891481876
      AP@4: hit@0 -> P@1 = 1/1 = 1; hit@2 -> P@3 = 2/3
             (1 + 2/3) / min(|relevant|, 4) = (5/3) / 2 = 5/6
    """
    ranked = ["a", "x", "b", "y"]
    relevant = {"a", "b"}

    dcg = 1.0 / math.log2(2) + 1.0 / math.log2(4)
    idcg = 1.0 / math.log2(2) + 1.0 / math.log2(3)
    ap = (1.0 / 1 + 2.0 / 3) / min(len(relevant), 4)
    assert dcg == 1.5
    assert ap == pytest.approx(5.0 / 6.0, rel=1e-15)

    got = evaluate.user_metrics(ranked, relevant, 4)
    assert got["precision"] == 0.5
    assert got["recall"] == 1.0
    assert got["ndcg"] == pytest.approx(0.9197207891481876, rel=1e-12)
    assert got["ndcg"] == pytest.approx(dcg / idcg, rel=1e-15)
    assert got["map"] == pytest.approx(5.0 / 6.0, rel=1e-12)
    assert got["map"] == pytest.approx(ap, rel=1e-15)

    # Relevance below the cutoff is ignored; the run past k is never read.
    deep = evaluate.user_metrics(
        ["x", "y", "z", "w", "a", "b"], relevant, 4
    )
    assert deep["precision"] == 0.0
    assert deep["recall"] == 0.0
    assert deep["ndcg"] == 0.0
    assert deep["map"] == 0.0

    # Relevant items beyond K still count in the denominator (IDCG capped).
    capped = evaluate.user_metrics(["a", "b"], {"a", "b", "c", "d", "e"}, 2)
    assert capped["precision"] == 1.0
    assert capped["recall"] == pytest.approx(2 / 5)
    assert capped["ndcg"] == pytest.approx(1.0)


def test_user_metrics_no_relevance_is_zero() -> None:
    got = evaluate.user_metrics(["a", "b", "c"], set(), k=3)
    assert got == {"precision": 0.0, "recall": 0.0, "ndcg": 0.0, "map": 0.0}

    # No relevance AND no candidates: still finite zeros, never a ZeroDivision.
    assert evaluate.user_metrics([], set(), k=10) == {
        "precision": 0.0,
        "recall": 0.0,
        "ndcg": 0.0,
        "map": 0.0,
    }

    # k=0 is a hard zero rather than a ZeroDivisionError.
    assert evaluate.user_metrics(["a"], {"a"}, k=0)["precision"] == 0.0
    assert evaluate.user_metrics(["a"], {"a"}, k=0)["map"] == 0.0


def test_user_metrics_perfect_ranking_is_one() -> None:
    got = evaluate.user_metrics(["a", "b", "c"], {"a", "b", "c"}, k=3)
    assert got["precision"] == 1.0
    assert got["recall"] == 1.0
    # DCG == IDCG when the relevant items fill the top ranks in order.
    assert got["ndcg"] == pytest.approx(1.0, rel=1e-12)
    # P@1 = P@2 = P@3 = 1 -> AP = 1.
    assert got["map"] == pytest.approx(1.0, rel=1e-12)

    # Two of three relevant at the top: P@3 = R@3 = 2/3, but the third
    # relevant item is unreachable, so IDCG@3 penalises NDCG:
    #   DCG  = 1/log2(2) + 1/log2(3)                       = 1.6309297535714574
    #   IDCG = 1/log2(2) + 1/log2(3) + 1/log2(4)           = 2.1309297535714578
    #   NDCG = 0.7653606369886217;  AP = (1/1 + 2/2) / 3 = 2/3
    partial = evaluate.user_metrics(["a", "b", "c"], {"a", "b", "z"}, k=3)
    assert partial["precision"] == pytest.approx(2 / 3)
    assert partial["recall"] == pytest.approx(2 / 3)
    assert partial["ndcg"] == pytest.approx(0.7653606369886217, rel=1e-12)
    assert partial["map"] == pytest.approx(2 / 3, rel=1e-12)


def test_macro_empty_and_average() -> None:
    empty = evaluate._macro([])
    assert empty == {"precision": 0.0, "recall": 0.0, "ndcg": 0.0, "map": 0.0}

    rows = [
        {"precision": 1.0, "recall": 1.0, "ndcg": 1.0, "map": 1.0},
        {"precision": 0.0, "recall": 0.0, "ndcg": 0.0, "map": 0.0},
        {"precision": 0.5, "recall": 0.25, "ndcg": 0.5, "map": 0.5},
    ]
    got = evaluate._macro(rows)
    assert got["precision"] == pytest.approx(0.5)
    assert got["recall"] == pytest.approx(0.4166666666666667)
    assert got["ndcg"] == pytest.approx(0.5)
    assert got["map"] == pytest.approx(0.5)
    # A single row passes through unchanged.
    assert evaluate._macro(rows[:1]) == rows[0]


# --------------------------------------------------------------------------
# evaluate() + MLflow
# --------------------------------------------------------------------------


def test_evaluate_baseline_only_is_fallible(
    write_parquet: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _tmp_tracking_uri(tmp_path, monkeypatch)
    write_parquet(events=EVENTS_FRAME)

    result = evaluate.evaluate("v1", k=evaluate.K, baseline_only=True)
    assert result["baseline_only"] is True
    assert result["n_test_users"] >= 1
    # The baseline is scored against itself, so the delta is exactly zero and
    # the gate MUST fail — this is what proves the gate is not rigged.
    assert result["delta"] == pytest.approx(0.0, abs=1e-12)
    assert result["ndcg_hybrid"] == pytest.approx(result["ndcg_baseline"])
    assert result["passed"] is False
    assert result["margin"] == evaluate.MARGIN == 0.02


def test_evaluate_hybrid_result_shape(
    write_parquet: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _tmp_tracking_uri(tmp_path, monkeypatch)
    write_parquet(events=EVENTS_FRAME)

    result = evaluate.evaluate("v1", k=evaluate.K)
    expected_keys = {
        "version", "seed", "k", "n_test_users", "n_train_events",
        "n_holdout_events", "ndcg_hybrid", "ndcg_baseline", "delta", "margin",
        "precision", "recall", "map", "precision_baseline", "recall_baseline",
        "map_baseline", "n_cold_start", "n_warm", "ndcg_cold_start",
        "ndcg_warm", "strategy_counts", "n_rank_errors", "passed",
        "baseline_only",
        "ndcg_category_oracle", "delta_vs_oracle",
        "cold_start_covered", "oracle_margin_ok",
    }
    assert set(result) == expected_keys
    assert result["version"] == "v1"
    assert result["seed"] == evaluate.SEED == 42
    assert result["k"] == evaluate.K == 10
    assert result["baseline_only"] is False
    assert result["n_test_users"] >= 1
    assert isinstance(result["passed"], bool)
    for key in (
        "ndcg_hybrid", "ndcg_baseline", "delta", "precision", "recall", "map",
        "precision_baseline", "recall_baseline", "map_baseline",
    ):
        assert 0.0 <= result[key] <= 1.0 or key == "delta"
    assert result["delta"] == pytest.approx(
        result["ndcg_hybrid"] - result["ndcg_baseline"]
    )
    assert result["passed"] is bool(
        result["delta"] > evaluate.MARGIN and result["cold_start_covered"]
    )
    assert result["n_cold_start"] + result["n_warm"] == result["n_test_users"]
    assert result["n_rank_errors"] == 0
    assert sum(result["strategy_counts"].values()) == result["n_test_users"]
    # A different k is honoured end to end.
    narrow = evaluate.evaluate("v1", k=3)
    assert narrow["k"] == 3


def _live_store_files() -> set[str]:
    """Snapshot of the real ``recommendation/models/mlruns`` file set."""
    live = Path(evaluate.__file__).resolve().parents[1] / "models" / "mlruns"
    return {str(p.relative_to(live)) for p in live.rglob("*")} if live.is_dir() else set()


def test_log_mlflow_eval_hermetic(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    live_before = _live_store_files()
    store = _tmp_tracking_uri(tmp_path, monkeypatch)
    result = {
        "version": "v1",
        "seed": evaluate.SEED,
        "k": evaluate.K,
        "factors": 16,
        "n_test_users": 3,
        "ndcg_hybrid": 0.5,
        "ndcg_baseline": 0.1,
        "delta": 0.4,
        "precision": 0.2,
        "recall": 0.3,
        "map": 0.25,
        "passed": True,
        "baseline_only": False,
    }
    evaluate.log_mlflow_eval_best_effort(result)

    assert store.is_dir()
    runs = list(store.rglob("eval_v1.json"))
    assert runs, "eval result JSON was not logged into the tmp store"
    logged = json.loads(runs[0].read_text(encoding="utf-8"))
    assert logged["ndcg_hybrid"] == 0.5
    assert logged["delta"] == 0.4
    metrics = runs[0].parent.parent / "metrics"
    logged_metric = (metrics / "ndcg_hybrid").read_text(encoding="utf-8").split()
    assert float(logged_metric[1]) == 0.5
    params = runs[0].parent.parent / "params"
    assert (params / "factors").read_text(encoding="utf-8").strip() == "16"
    # The real model store is never the target of the eval logger: its file
    # set is byte-identical before and after (it ships pre-populated).
    assert _live_store_files() == live_before

    # Best-effort: a broken MLflow is warned about, never raised.
    def _boom(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("mlflow is down")

    monkeypatch.setattr("mlflow.set_tracking_uri", _boom)
    evaluate.log_mlflow_eval_best_effort(result)

    # A factors-less result falls back to the recorded model factors.
    monkeypatch.undo()
    _tmp_tracking_uri(tmp_path, monkeypatch)
    evaluate.log_mlflow_eval_best_effort({**result, "factors": None})


def test_mlflow_tracking_uri_points_at_models_mlruns() -> None:
    uri = evaluate._mlflow_tracking_uri()
    assert uri.startswith("file:")
    expected = (
        Path(evaluate.__file__).resolve().parents[1] / "models" / "mlruns"
    ).resolve()
    assert uri == "file:" + expected.as_posix()
    assert Path(uri[len("file:"):]).is_absolute()
    # CWD-independent: the same answer from an unrelated working directory.
    import os

    cwd = os.getcwd()
    try:
        os.chdir("/")
        assert evaluate._mlflow_tracking_uri() == uri
    finally:
        os.chdir(cwd)
    assert evaluate.MLFLOW_EXPERIMENT == "recsys"


# --------------------------------------------------------------------------
# category oracle
# --------------------------------------------------------------------------


def test_category_oracle_prefers_the_users_own_categories() -> None:
    """The oracle ranks the user's own categories first, by popularity.

    The user's own train items are excluded (relevance is novel-holdout
    only), so a-1 is the *category signal* and a-2 is the expected
    recommendation. b-1 is far more popular overall, but u1 never touched
    "beta", so it must not outrank the alpha neighbour.
    """
    items = pd.DataFrame(
        [
            {"item_id": "a-1", "category_path": ["alpha"], "available": True},
            {"item_id": "a-2", "category_path": ["alpha"], "available": True},
            {"item_id": "b-1", "category_path": ["beta"], "available": True},
        ]
    )
    train = pd.DataFrame(
        [
            # u1's only touch is a-1 -> wanted category is "alpha".
            {"user_id": "u1", "item_id": "a-1",
             "timestamp": "2026-01-01T00:00:00+00:00"},
            # b-1 is far more popular overall, but u1 never touched "beta".
            {"user_id": "u2", "item_id": "b-1",
             "timestamp": "2026-01-01T00:00:00+00:00"},
            {"user_id": "u2", "item_id": "b-1",
             "timestamp": "2026-01-02T00:00:00+00:00"},
            {"user_id": "u2", "item_id": "b-1",
             "timestamp": "2026-01-03T00:00:00+00:00"},
        ]
    )
    top = oracle_mod.category_oracle_topk(train, items, "u1", k=2)
    assert top == ["a-2"]


def test_category_oracle_falls_back_to_popularity_when_no_categories() -> None:
    """No usable train item -> global popularity, never empty, never raising."""
    items = pd.DataFrame(
        [{"item_id": "b-1", "category_path": ["beta"], "available": True}]
    )
    train = pd.DataFrame(
        [{"user_id": "u1", "item_id": "missing-item", "timestamp": "2026-01-01T00:00:00+00:00"}]
    )
    top = oracle_mod.category_oracle_topk(train, items, "u1", k=3)
    assert isinstance(top, list)
    assert top == ["b-1"]


def test_category_oracle_never_returns_duplicates_and_respects_k() -> None:
    """A short candidate pool returns fewer than k, not padded duplicates.

    The catalog must be larger than the user's own train items, otherwise
    the own-item exclusion empties the pool and the test asserts nothing
    meaningful.
    """
    items = pd.DataFrame(
        [
            {"item_id": "a-1", "category_path": ["alpha"], "available": True},
            {"item_id": "a-2", "category_path": ["alpha"], "available": True},
            {"item_id": "a-3", "category_path": ["alpha"], "available": True},
        ]
    )
    train = pd.DataFrame(
        [
            {"user_id": "u1", "item_id": "a-1",
             "timestamp": "2026-01-01T00:00:00+00:00"},
        ]
    )
    top = oracle_mod.category_oracle_topk(train, items, "u1", k=25)
    assert len(top) == len(set(top)) == 2
    assert "a-1" not in top


# --- Task 2: light users in the seed so the cold-start path is scored -------
# `scripts/seed.py` is a script, not an importable package module, so it is
# loaded by path at module scope.

import importlib.util
import pathlib

from recommendation.app.baseline import cold_start_threshold

_seed_spec = importlib.util.spec_from_file_location(
    "seed_under_test",
    pathlib.Path(__file__).resolve().parents[1] / "scripts" / "seed.py",
)
assert _seed_spec is not None and _seed_spec.loader is not None
seed_mod = importlib.util.module_from_spec(_seed_spec)
_seed_spec.loader.exec_module(seed_mod)


def test_generate_emits_users_below_the_cold_start_threshold() -> None:
    """Light users exist and are strictly below the cold-start threshold."""
    import random

    users, items, events = seed_mod.generate(
        random.Random(seed_mod.SEED), seed_mod.N_EVENTS, as_of=seed_mod.NOW_ANCHOR
    )
    per_user: dict[str, int] = {}
    for ev in events:
        per_user[ev["user_id"]] = per_user.get(ev["user_id"], 0) + 1

    threshold = cold_start_threshold()
    light = [u for u, n in per_user.items() if n < threshold]
    assert light, "seed must produce at least one cold-start user"

    known = {u["user_id"] for u in users}
    for uid in light:
        assert 1 <= per_user[uid] < threshold
        assert uid in known


def test_light_user_events_are_valid() -> None:
    """Every light-user row still passes EventIn validation."""
    import random

    _, _, events = seed_mod.generate(
        random.Random(seed_mod.SEED), seed_mod.N_EVENTS, as_of=seed_mod.NOW_ANCHOR
    )
    per_user: dict[str, int] = {}
    for ev in events:
        per_user[ev["user_id"]] = per_user.get(ev["user_id"], 0) + 1
    threshold = cold_start_threshold()
    light_rows = [
        ev for ev in events if per_user[ev["user_id"]] < threshold
    ]
    assert light_rows
    for ev in light_rows:
        # seed.generate() already validates via EventIn; this asserts the
        # generated payloads are the validated shape (request_id present,
        # one item per event, aware timestamp).
        assert ev["request_id"]
        assert isinstance(ev["item_id"], str)
        assert ev["timestamp"].endswith("+00:00")


# --- Task 3: a light user's last event is held out, so cold start is scored --


def test_split_holds_out_the_last_event_of_a_light_user() -> None:
    """A 1-event user becomes a test user with that event in holdout."""
    import pandas as pd

    frame = pd.DataFrame(
        [
            {
                "user_id": "user-light-001",
                "item_id": "a-1",
                "timestamp": "2026-02-01T00:00:00+00:00",
            }
        ]
    )
    train, holdout = evaluate.split_temporal_holdout(frame)
    assert holdout == {"user-light-001": ["a-1"]}
    assert train.empty


def test_split_light_user_with_four_events_holds_out_one() -> None:
    """A 4-event user holds out exactly 1 (int(4*0.2)==0 -> max(1, .))."""
    import pandas as pd

    frame = pd.DataFrame(
        [
            {
                "user_id": "u",
                "item_id": f"i-{i}",
                "timestamp": f"2026-02-0{i}T00:00:00+00:00",
            }
            for i in range(1, 5)
        ]
    )
    train, holdout = evaluate.split_temporal_holdout(frame)
    assert holdout == {"u": ["i-4"]}
    assert len(train) == 3


def test_cold_start_covered_is_false_when_nothing_is_cold() -> None:
    """The flag is derived from n_cold_start, so 0 -> False."""
    from recommendation.app import evaluate as ev

    assert ev._cold_start_covered(0) is False
    assert ev._cold_start_covered(1) is True
    assert ev._cold_start_covered(22) is True


def test_gate_fails_when_cold_start_is_uncovered(
    write_parquet: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Zero cold-start test users must make `passed` False, not True."""
    from recommendation.app import evaluate as ev

    write_parquet()
    # Force every test user to look warm: the fake rank reports cold_start False.
    monkeypatch.setattr(
        ev._ranker,
        "rank",
        lambda user_id, count=10, **kw: {
            "recommendations": [{"item_id": "x", "score": 1.0, "reason": "als"}],
            "cold_start": False,
            "strategy": "als_hybrid",
            "model_version": "v1",
        },
    )
    result = ev.evaluate(version="t")
    assert result["n_cold_start"] == 0
    assert result["cold_start_covered"] is False
    assert result["passed"] is False
