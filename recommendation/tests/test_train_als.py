"""Tests for :mod:`recommendation.app.train_als` (todo 9).

Covers row validation (including the ``EventType.__members__`` regression),
pandas-sentinel cleaning, snapshot loading + dedup, the CSR confidence maths,
factor selection, ALS fit/save/load/recommend, the ``current_version.txt``
pointer, the tracking-URI resolver, and the end-to-end ``train()`` pipeline
including its snapshot cleanup on both the success and the no-data path.

Hermetic: ``write_parquet()`` redirects the consumer data paths and
``train_als.MODELS_DIR`` into ``tmp_path``; every MLflow call is pinned to a
``tmp_path`` file store, so ``recommendation/models/mlruns`` is never touched.
"""

from __future__ import annotations

import functools
import json
import math
import sys
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from recommendation.app import consumer, train_als
from recommendation.app.bus import EVENT_WEIGHTS
from recommendation.app.schemas import EventType, EventValue


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
make_event = _CONFTEST.make_event

_ROW_KEYS = [
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
]


def _frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame([{k: r.get(k) for k in _ROW_KEYS} for r in rows])


# --------------------------------------------------------------------------
# _clean + _row_to_event
# --------------------------------------------------------------------------


def test_clean_maps_pandas_sentinels() -> None:
    assert train_als._clean(float("nan")) is None
    assert train_als._clean(pd.NaT) is None
    assert train_als._clean(None) is None
    import numpy as np

    assert train_als._clean(np.float64("nan")) is None
    assert train_als._clean(0) == 0
    assert train_als._clean("") == ""
    assert train_als._clean(False) is False
    assert train_als._clean(4.5) == 4.5


def test_row_to_event_valid_and_rejections() -> None:
    row = consumer.event_to_row(
        make_event("user-001", "ele-001", EventType.view, days_ago=3)
    )
    event = train_als._row_to_event(row)
    assert event.event_type is EventType.view
    assert event.user_id == "user-001"
    assert event.item_id == "ele-001"
    assert event.request_id == row["request_id"]
    # A view carries no payload -> value stays None, not an all-None EventValue.
    assert event.value is None

    # `EventType.__members__` lookup: on Python <= 3.11 the old
    # `event_type_raw not in EventType` raised TypeError, and the caller's
    # blanket except turned every training row into "no training data".
    paying = {**row, "quantity": 1, "unit_price_cents": 999, "currency": "USD"}
    for member in EventType:
        assert train_als._row_to_event({**paying, "event_type": member.value})

    # Rating round-trip: the persisted rating must survive the read-back, or
    # every rating event would train at the default weight 3.
    rating_row = {
        **row,
        "event_type": "rating",
        "rating": 4.5,
        "query": None,
    }
    rated = train_als._row_to_event(rating_row)
    assert rated.event_type is EventType.rating
    assert rated.value is not None
    assert rated.value.rating == 4.5

    query_row = {**row, "event_type": "search", "query": "wireless mouse"}
    searched = train_als._row_to_event(query_row)
    assert searched.value is not None
    assert searched.value.query == "wireless mouse"

    bad_type = {**row, "event_type": "bogus"}
    with pytest.raises(ValueError, match="unknown event_type"):
        train_als._row_to_event(bad_type)

    with pytest.raises(ValueError, match="unknown event_type"):
        train_als._row_to_event({**row, "event_type": None})
    with pytest.raises(ValueError, match="unknown event_type"):
        train_als._row_to_event({**row, "event_type": 7})
    with pytest.raises(ValueError, match="unknown event_type"):
        train_als._row_to_event({**row, "event_type": ["view"]})

    with pytest.raises(ValueError):
        train_als._row_to_event({**row, "user_id": None})
    with pytest.raises(ValueError):
        train_als._row_to_event({**row, "item_id": None})
    with pytest.raises(ValueError):
        train_als._row_to_event(
            {**row, "event_type": "purchase", "rating": None,
             "quantity": None, "unit_price_cents": None, "currency": None}
        )


# --------------------------------------------------------------------------
# build_user_item_matrix
# --------------------------------------------------------------------------


def test_build_user_item_matrix_math() -> None:
    rows = [
        consumer.event_to_row(
            make_event("user-001", "ele-001", EventType.view, days_ago=5)
        ),
        consumer.event_to_row(
            make_event("user-001", "ele-001", EventType.click, days_ago=4)
        ),
        consumer.event_to_row(
            make_event("user-001", "ele-002", EventType.purchase, days_ago=3)
        ),
        consumer.event_to_row(
            make_event("user-002", "ele-002", EventType.cart, days_ago=2)
        ),
        consumer.event_to_row(
            make_event("user-002", "boo-001", EventType.rating, days_ago=1,
                       value=EventValue(rating=4.5))
        ),
    ]
    rows += [
        # Corrupt rows: skipped, never trained on.
        {**rows[0], "request_id": "bad-1", "event_type": "bogus"},
        {**rows[0], "request_id": "bad-2", "user_id": ""},
    ]
    matrix, user_ids, item_ids, n_interactions = train_als.build_user_item_matrix(
        _frame(rows)
    )
    assert user_ids == ["user-001", "user-002"]
    assert item_ids == ["boo-001", "ele-001", "ele-002"]
    assert n_interactions == 5
    assert matrix.shape == (2, 3)

    def at(user: str, item: str) -> float:
        return float(matrix[user_ids.index(user), item_ids.index(item)])

    # Duplicate (user, item) pairs SUM their confidences.
    assert at("user-001", "ele-001") == pytest.approx(
        EVENT_WEIGHTS[EventType.view] + EVENT_WEIGHTS[EventType.click]
    )
    assert at("user-001", "ele-002") == pytest.approx(EVENT_WEIGHTS[EventType.purchase])
    assert at("user-002", "ele-002") == pytest.approx(EVENT_WEIGHTS[EventType.cart])
    # Rating events weigh their clamped rating, not the default 3.
    assert at("user-002", "boo-001") == pytest.approx(4.5)
    assert at("user-001", "boo-001") == 0.0
    assert matrix.nnz == 4

    with pytest.raises(train_als.NoTrainingDataError, match="no training data"):
        train_als.build_user_item_matrix(None)  # type: ignore[arg-type]


_NO_DATA_FRAMES = {
    "frame0": pd.DataFrame(),
    "frame1": _frame(
        [
            {"request_id": "x1", "user_id": "u", "item_id": "i",
             "event_type": "bogus", "timestamp": "2026-01-01T00:00:00+00:00"},
            {"request_id": "x2", "user_id": "", "item_id": "",
             "event_type": "view", "timestamp": "2026-01-01T00:00:00+00:00"},
        ]
    ),
}


@pytest.mark.parametrize("frame", list(_NO_DATA_FRAMES.values()))
def test_build_user_item_matrix_no_data_raises(frame: pd.DataFrame) -> None:
    with pytest.raises(train_als.NoTrainingDataError, match="no training data"):
        train_als.build_user_item_matrix(frame)


# --------------------------------------------------------------------------
# load_snapshot_frame
# --------------------------------------------------------------------------


def test_load_snapshot_frame_merges_and_dedups(write_parquet: Any) -> None:
    data_dir = Path(write_parquet())
    snapshot = data_dir.parent / "snapshot_v1"
    (snapshot / "incoming").mkdir(parents=True, exist_ok=True)

    stale = consumer.event_to_row(
        make_event("user-001", "ele-001", EventType.view, days_ago=9,
                   request_id="req-dup")
    )
    fresh = consumer.event_to_row(
        make_event("user-001", "boo-003", EventType.click, days_ago=1,
                   request_id="req-dup")
    )
    pd.DataFrame([stale]).to_parquet(snapshot / "incoming" / "batch_1.parquet",
                                     index=False)
    pd.DataFrame([fresh]).to_parquet(snapshot / "incoming" / "batch_2.parquet",
                                     index=False)

    frame = train_als.load_snapshot_frame(snapshot)
    assert len(frame) == 1
    assert frame.iloc[0]["item_id"] == "boo-003"

    # No snapshot files at all -> empty frame, never an exception.
    empty = train_als.load_snapshot_frame(data_dir.parent / "snapshot_none")
    assert empty.empty


# --------------------------------------------------------------------------
# select_factors / _current_model_dir / tracking uri
# --------------------------------------------------------------------------


def test_select_factors_boundary() -> None:
    assert train_als.FACTORS_SMALL == 16
    assert train_als.FACTORS_LARGE == 64
    assert train_als.FACTORS_USER_THRESHOLD == 1000
    assert train_als.select_factors(0) == train_als.FACTORS_SMALL
    assert train_als.select_factors(1) == train_als.FACTORS_SMALL
    assert train_als.select_factors(1000) == train_als.FACTORS_SMALL
    assert train_als.select_factors(1001) == train_als.FACTORS_LARGE
    assert train_als.select_factors(50_000) == train_als.FACTORS_LARGE


def test_current_model_dir_resolves_pointer(models_dir: Path) -> None:
    (models_dir / "current_version.txt").write_text("v7\n", encoding="utf-8")
    assert train_als._current_model_dir(models_dir) == models_dir / "als_v7"

    (models_dir / "current_version.txt").write_text("  v9  \n", encoding="utf-8")
    assert train_als._current_model_dir(models_dir) == models_dir / "als_v9"

    (models_dir / "current_version.txt").unlink()
    with pytest.raises(FileNotFoundError):
        train_als._current_model_dir(models_dir)


def test_mlflow_tracking_uri_relative_and_absolute(tmp_path: Path) -> None:
    absolute = train_als._mlflow_tracking_uri(tmp_path / "models")
    assert absolute.startswith("file:")
    assert absolute == "file:" + (tmp_path / "models" / "mlruns").as_posix()
    assert Path(absolute[len("file:"):]).is_absolute()

    repo_root = Path(train_als.__file__).resolve().parents[2]
    relative = train_als._mlflow_tracking_uri(Path("recommendation") / "models")
    assert relative == "file:" + (
        repo_root / "recommendation" / "models" / "mlruns"
    ).as_posix()


def test_log_mlflow_best_effort_hermetic(
    models_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    model_dir = models_dir / "als_v1"
    model_dir.mkdir(parents=True)
    (model_dir / "mappings.json").write_text(
        json.dumps({"factors": 16, "n_users": 2}), encoding="utf-8"
    )
    monkeypatch.setenv("MLFLOW_TRACKING_URI", str(models_dir / "env-mlruns"))
    monkeypatch.setenv("MLFLOW_ALLOW_FILE_STORE", "true")

    train_als.log_mlflow_best_effort(
        {"factors": 16, "seed": train_als.SEED},
        {"n_users": 2, "n_items": 3, "n_interactions": 5},
        model_dir=model_dir,
        run_name="train-v1",
        models_dir=models_dir,
    )
    store = models_dir / "mlruns"
    assert store.is_dir()
    assert any(store.rglob("mappings.json"))

    # A broken MLflow must be swallowed, not raised: training never depends on it.
    def _boom(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("mlflow is down")

    monkeypatch.setattr("mlflow.set_tracking_uri", _boom)
    train_als.log_mlflow_best_effort(
        {"factors": 16}, {"n_users": 2}, models_dir=models_dir
    )


# --------------------------------------------------------------------------
# ALS fit / save / load / recommend
# --------------------------------------------------------------------------


def _tiny_matrix(factors: int = 4) -> tuple[Any, list[str], list[str], int]:
    rows = [
        consumer.event_to_row(
            make_event("user-001", "ele-001", EventType.view, days_ago=5)
        ),
        consumer.event_to_row(
            make_event("user-001", "ele-002", EventType.click, days_ago=4)
        ),
        consumer.event_to_row(
            make_event("user-002", "ele-001", EventType.purchase, days_ago=3)
        ),
        consumer.event_to_row(
            make_event("user-002", "boo-001", EventType.cart, days_ago=2)
        ),
    ]
    return train_als.build_user_item_matrix(_frame(rows))


def test_train_model_factor_shape() -> None:
    matrix, user_ids, item_ids, n = _tiny_matrix()
    model = train_als.train_model(matrix, factors=8, seed=train_als.SEED, iterations=3)
    assert model.factors == 8
    assert tuple(model.user_factors.shape) == (len(user_ids), 8)
    assert tuple(model.item_factors.shape) == (len(item_ids), 8)
    assert matrix.shape == (len(user_ids), len(item_ids))
    assert n == 4

    # Same seed -> identical factors; different seed -> different.
    again = train_als.train_model(matrix, factors=8, seed=train_als.SEED, iterations=3)
    assert (model.user_factors == again.user_factors).all()
    other = train_als.train_model(matrix, factors=8, seed=7, iterations=3)
    assert not (model.user_factors == other.user_factors).all()


def test_recommend_smoke_and_unknown_user(models_dir: Path, data_dir: Path) -> None:
    matrix, user_ids, item_ids, n = _tiny_matrix()
    model = train_als.train_model(matrix, factors=4, iterations=2)
    out = train_als.save_model(
        model,
        models_dir / "als_v1",
        user_ids,
        item_ids,
        factors=4,
        seed=train_als.SEED,
        n_interactions=n,
    )
    assert (out / "model.npz").is_file()
    mappings = json.loads((out / "mappings.json").read_text(encoding="utf-8"))
    assert mappings["user_ids"] == user_ids
    assert mappings["item_ids"] == item_ids
    assert mappings["factors"] == 4
    assert mappings["seed"] == train_als.SEED
    assert mappings["n_users"] == len(user_ids)
    assert mappings["n_items"] == len(item_ids)
    assert mappings["n_interactions"] == n

    reloaded, reloaded_mappings = train_als.load_model(out)
    assert reloaded_mappings["user_ids"] == user_ids

    recs = train_als.recommend("user-001", n=2, model_dir=out)
    assert len(recs) == 2
    assert len(set(recs)) == 2
    assert set(recs) <= set(item_ids)
    assert train_als.recommend("user-001", n=99, model_dir=out)  # clamped to n_items

    with pytest.raises(KeyError, match="unknown user_id"):
        train_als.recommend("nobody", n=5, model_dir=out)


# --------------------------------------------------------------------------
# train() end to end
# --------------------------------------------------------------------------


def _bind_train_to_data(monkeypatch: pytest.MonkeyPatch, data_dir: Path) -> None:
    """Point ``train()``'s snapshot import at the tmp data dir.

    ``train_als.train`` calls ``snapshot_for_training(snapshot_dir)`` and
    ``consumer.snapshot_for_training`` binds its data paths as *default
    arguments* at import time, so the conftest's module-global patch cannot
    reach it — without this, ``train()`` would snapshot the live
    ``recommendation/data/``. Binding the real function to the tmp paths keeps
    the genuine SHARED-lock copy in the loop.
    """
    monkeypatch.setattr(
        train_als,
        "snapshot_for_training",
        functools.partial(
            consumer.snapshot_for_training,
            incoming_dir=data_dir / "incoming",
            interactions_path=data_dir / "interactions.parquet",
            lock_path=data_dir / ".merge.lock",
        ),
    )


def test_train_full_pipeline_hermetic(
    write_parquet: Any, models_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    data_dir = Path(write_parquet())
    _bind_train_to_data(monkeypatch, data_dir)
    live_log = data_dir / "interactions.parquet"
    stats = train_als.train("v42", models_dir=models_dir)
    assert stats["version"] == "v42"
    assert stats["seed"] == train_als.SEED
    assert stats["iterations"] == train_als.ITERATIONS
    assert stats["regularization"] == train_als.REGULARIZATION
    assert stats["factors"] == train_als.select_factors(stats["n_users"])
    assert stats["n_users"] == 3
    assert stats["n_items"] == 6
    assert stats["n_interactions"] == 10
    assert stats["coverage_pairs"] >= 1
    assert stats["model_dir"] == str(models_dir / "als_v42")

    model_dir = models_dir / "als_v42"
    assert (model_dir / "model.npz").is_file()
    assert json.loads((model_dir / "mappings.json").read_text(encoding="utf-8"))[
        "factors"
    ] == stats["factors"]
    assert (models_dir / "current_version.txt").read_text(encoding="utf-8") == "v42\n"
    assert train_als._current_model_dir(models_dir) == model_dir
    # Build artifact removed: no snapshot dirs left behind.
    assert not (models_dir / "snapshot_v42").exists()
    assert not list(models_dir.glob("snapshot_*"))
    # MLflow went to the tmp models dir, never the live one.
    assert (models_dir / "mlruns").is_dir()
    assert not (data_dir / "mlruns").exists()
    # The live interaction log is never mutated by a training run.
    assert Path(live_log).is_file()
    assert len(pd.read_parquet(live_log)) == 10
    _ = data_dir


def test_train_no_data_raises_and_cleans_snapshot(
    write_parquet: Any, models_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    data_dir = Path(write_parquet(events=pd.DataFrame(columns=_ROW_KEYS)))
    _bind_train_to_data(monkeypatch, data_dir)
    with pytest.raises(train_als.NoTrainingDataError, match="no training data"):
        train_als.train("v0", models_dir=models_dir)
    assert not (models_dir / "snapshot_v0").exists()
    assert not list(models_dir.glob("snapshot_*"))
    assert not (models_dir / "als_v0").exists()

    corrupt = _frame(
        [
            {"request_id": "c1", "user_id": "u", "item_id": "i",
             "event_type": "bogus", "timestamp": "2026-01-01T00:00:00+00:00"},
            {"request_id": "c2", "user_id": "u2", "item_id": "i2",
             "event_type": "purchase", "timestamp": "2026-01-01T00:00:00+00:00"},
        ]
    )
    Path(write_parquet(events=corrupt))
    with pytest.raises(train_als.NoTrainingDataError):
        train_als.train("vbad", models_dir=models_dir)
    assert not (models_dir / "snapshot_vbad").exists()
    assert not list(models_dir.glob("snapshot_*"))



