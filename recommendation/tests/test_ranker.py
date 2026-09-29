"""Contract tests for :func:`recommendation.app.ranker.rank` (todo 10).

The ranker is the serving entry point: it blends ALS, content-similar, and
trending candidates, applies the v1 business rules (available-only,
suppression, dedup, max-2-adjacent diversity), reports a cold-start flag, and
degrades instead of raising whenever a model artifact is missing.

Fixture world (``tests/conftest.py``): a 6-item catalog in 2 top-level
categories (``ele-001..003`` = electronics, ``boo-001..003`` = books, all
available) and 10 events giving ``user-001`` six interactions (>= the
cold-start threshold of 5 -> known), ``user-002`` three, ``user-003`` one, and
``ghost-user-xyz`` none (zero history -> cold start).

Hermeticity note: ``write_parquet`` redirects ``ranker._MODELS_DIR`` (the
directory the version pointer is read from) *and* ``train_als.MODELS_DIR``,
but ``train_als._current_model_dir`` binds ``MODELS_DIR`` as a **default
argument**, evaluated at import time. Patching ``train_als.MODELS_DIR``
therefore does not move the ALS artifact lookup, and the ALS path would load
the committed ``recommendation/models/als_v1`` instead of the fixture's
model. ``_als_artifacts_follow_models_dir`` below re-points the resolver at
``ranker._MODELS_DIR`` so the ALS path is driven by the same (redirected)
directory as the pointer, keeping every assertion below about test data and
not about whatever happens to be committed in the repository.

Run from the repo root::

    PYTHONPATH=. MLFLOW_DISABLE_AGENT_HINT=1 \
        recommendation/.venv/bin/python -m pytest recommendation/tests/test_ranker.py -q
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from conftest import EVENT_SPECS, make_event
from recommendation.app import ranker, train_als
from recommendation.app.baseline import cold_start_threshold, trending
from recommendation.app.consumer import event_to_row
from recommendation.app.ranker import rank
from recommendation.app.schemas import Strategy

#: A user id that appears nowhere in the fixture events (zero history).
GHOST_USER = "ghost-user-xyz"

#: The one known user at/above the cold-start threshold in the fixture data.
KNOWN_USER = "user-001"

#: Synthetic user used by the cold-start threshold sweep.
SWEEP_USER = "threshold-sweep-user"

#: Every ``reason`` the ranker may emit (argmax weighted component).
ALL_REASONS = frozenset({"als", "content_similar", "trending"})

#: Count values exercised by the never-empty / respects-count contract.
COUNT_SIZES = (1, 3, 5, 10, 50)


@pytest.fixture(autouse=True)
def _als_artifacts_follow_models_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    """Resolve ``models/als_{version}`` from ``ranker._MODELS_DIR``.

    ``train_als._current_model_dir`` takes ``MODELS_DIR`` as a default
    argument, so it is frozen at import time and ignores the fixture's
    ``train_als.MODELS_DIR`` patch. Re-implementing the same pointer
    resolution against the redirected ``ranker._MODELS_DIR`` keeps the ALS
    path inside ``tmp_path`` -- without it these tests silently read the
    committed model and the "missing model" case can never degrade.
    """

    def _resolve() -> Path:
        version = (Path(ranker._MODELS_DIR) / "current_version.txt").read_text(
            encoding="utf-8"
        ).strip()
        if not version:
            raise FileNotFoundError("blank model version pointer")
        return Path(ranker._MODELS_DIR) / f"als_{version}"

    monkeypatch.setattr(train_als, "_current_model_dir", _resolve)


def _available_ids(items: pd.DataFrame) -> list[str]:
    """Sorted ids of the available catalog rows."""
    avail = items[items["available"].astype(bool)]
    return sorted(avail["item_id"].astype(str).tolist())


def _category_of(items: pd.DataFrame) -> dict[str, str]:
    """Map item_id -> top-level ``category_path`` token."""
    return {
        str(row["item_id"]): str(row["category_path"][0])
        for _, row in items.iterrows()
    }


def _has_three_adjacent(categories: list[str]) -> bool:
    """True when some run of 3 consecutive categories is identical."""
    return any(
        categories[i] == categories[i + 1] == categories[i + 2]
        for i in range(len(categories) - 2)
    )


def _ids(result: dict) -> list[str]:
    """Extract the emitted item ids, in order."""
    return [str(row["item_id"]) for row in result["recommendations"]]


def _sweep_frame(n_interactions: int) -> pd.DataFrame:
    """Fixture events plus ``n_interactions`` extra events for SWEEP_USER.

    The extra events cycle over three items, so the interaction *count*
    grows while the distinct-item set stays small (the ranker counts rows,
    not pairs).
    """
    rows = [
        event_to_row(make_event(user, item, kind, days_ago=days))
        for user, item, kind, days in EVENT_SPECS
    ]
    rows += [
        event_to_row(make_event(SWEEP_USER, f"ele-{(k % 3) + 1:03d}", days_ago=k + 1))
        for k in range(n_interactions)
    ]
    return pd.DataFrame(rows)


def test_available_only(
    write_parquet: object,
    items_frame: pd.DataFrame,
) -> None:
    """Unavailable catalog rows are filtered out of every candidate source."""
    catalog = items_frame.copy()
    hidden = ["boo-001", "ele-003"]
    catalog.loc[catalog["item_id"].isin(hidden), "available"] = False
    write_parquet(items=catalog)  # type: ignore[operator]

    available = set(_available_ids(catalog))
    assert not (set(hidden) & available)
    assert len(available) == 4

    # The popularity source itself never sees an unavailable row.
    trending_ids = {str(row["item_id"]) for row in trending(limit=len(catalog))}
    assert trending_ids == available

    for user in (GHOST_USER, "user-002", "user-003", KNOWN_USER):
        result = rank(user, count=len(catalog))
        emitted = _ids(result)
        assert emitted, "never empty while the catalog has available items"
        assert set(emitted) <= available, (
            f"{user}: unavailable item leaked into {emitted}"
        )
        assert not (set(emitted) & set(hidden))

    # Nothing is suppressed for a zero-history user, so every available item
    # is reachable -- i.e. availability is the only thing being filtered.
    assert set(_ids(rank(GHOST_USER, count=len(catalog)))) == available


@pytest.mark.parametrize(
    "n,expected",
    [(0, True), (4, True), (5, False), (20, False)],
    ids=["0-True", "4-True", "5-False", "20-False"],
)
def test_cold_start_threshold_sweep(
    n: int,
    expected: bool,
    write_parquet: object,
) -> None:
    """``cold_start`` is ``n_interactions < cold_start_threshold()`` exactly."""
    # The recovered parametrization encodes the documented default of 5.
    assert cold_start_threshold() == 5

    write_parquet(events=_sweep_frame(n))  # type: ignore[operator]
    result = rank(SWEEP_USER, count=6)

    assert result["cold_start"] is expected
    assert result["strategy"] in {Strategy.trending, Strategy.content,
                                  Strategy.als_hybrid, Strategy.degraded}
    assert result["recommendations"], "a served user always gets a response"


def test_diversity_max_two_same_category_adjacent(
    write_parquet: object,
    items_frame: pd.DataFrame,
) -> None:
    """No emitted run of 3 consecutive items shares a top-level category."""
    write_parquet()  # type: ignore[operator]
    category_of = _category_of(items_frame)

    for user in (GHOST_USER, "user-003", "user-002", KNOWN_USER):
        categories = [category_of[i] for i in _ids(rank(user, count=len(items_frame)))]
        assert categories, f"{user}: empty response"
        assert not _has_three_adjacent(categories), (
            f"{user}: more than 2 adjacent items from one category in {categories}"
        )

    # The rule is not vacuous: the un-diversified popularity order for this
    # catalog does contain a run of 3, so the assertion above has teeth.
    popular = [str(row["item_id"]) for row in trending(limit=len(items_frame))]
    assert _has_three_adjacent([category_of[i] for i in popular])


def test_known_user_differs_from_popular(
    write_parquet: object,
    trained_model: Path,
) -> None:
    """A known user is served by the ALS-hybrid path, not pure popularity."""
    write_parquet()  # type: ignore[operator]
    catalog_size = 6

    # The fixture model is real and usable -- a known user is in its mappings.
    als_ids = train_als.recommend(KNOWN_USER, n=catalog_size, model_dir=trained_model)
    assert als_ids, "the trained ALS model produced no candidates"

    result = rank(KNOWN_USER, count=catalog_size)
    emitted = _ids(result)

    assert result["cold_start"] is False
    assert result["strategy"] == Strategy.als_hybrid, (
        "a user above the cold-start threshold must use the ALS-hybrid strategy"
    )

    popular = [str(row["item_id"]) for row in trending(limit=catalog_size)]
    assert emitted != popular, "known-user ordering must not be the popular ordering"
    assert emitted != _ids(rank(GHOST_USER, count=catalog_size)), (
        "a known user's response must differ from the cold-start popularity baseline"
    )
    # user-001 has interacted with every catalog item, so suppression empties
    # the candidate union and the documented fallback fills the response --
    # the blend is still what scored it (not a raw popularity passthrough).
    top = result["recommendations"][0]
    raw_top = float(trending(limit=1)[0]["score"])
    assert float(top["score"]) != raw_top


def test_missing_model_degrades_without_exception(
    write_parquet: object,
    trained_model: Path,
) -> None:
    """A pointer with no model directory behind it degrades, never raises."""
    write_parquet()  # type: ignore[operator]
    assert (Path(trained_model) / "model.npz").is_file()

    shutil.rmtree(trained_model)
    assert not Path(trained_model).exists()

    result = rank(KNOWN_USER, count=6)  # must not raise

    assert result["strategy"] == Strategy.degraded
    assert result["model_version"] == "v1"
    assert result["cold_start"] is False
    assert result["recommendations"], "degraded still serves the popularity path"
    assert {str(row["reason"]) for row in result["recommendations"]} <= ALL_REASONS


def test_missing_version_pointer_degrades(write_parquet: object) -> None:
    """No ``current_version.txt`` forces the degraded path (label "none")."""
    write_parquet(version=None)  # type: ignore[operator]

    result = rank(KNOWN_USER, count=6)  # must not raise

    assert result["strategy"] == Strategy.degraded
    assert result["model_version"] == "none"
    assert result["cold_start"] is False
    assert result["recommendations"]


def test_output_never_empty_and_respects_count(
    write_parquet: object,
    items_frame: pd.DataFrame,
) -> None:
    """Every response is non-empty, capped at ``count``, and deduped."""
    write_parquet()  # type: ignore[operator]
    available = set(_available_ids(items_frame))

    for user in (KNOWN_USER, GHOST_USER):
        for count in COUNT_SIZES:
            result = rank(user, count=count)
            emitted = _ids(result)

            assert emitted, f"{user} count={count}: response was empty"
            assert len(emitted) <= count, (
                f"{user} count={count}: emitted {len(emitted)} rows"
            )
            assert len(set(emitted)) == len(emitted), (
                f"{user} count={count}: duplicate item in {emitted}"
            )
            assert set(emitted) <= available
            assert all(str(row["reason"]) in ALL_REASONS
                       for row in result["recommendations"])
            assert all(isinstance(row["score"], float)
                       for row in result["recommendations"])
            assert result["model_version"] == "v1"


def test_purchased_and_seen_items_suppressed(write_parquet: object) -> None:
    """Every item a user interacted with is excluded from the response."""
    write_parquet()  # type: ignore[operator]

    # user-002: purchased boo-001, clicked boo-002, viewed boo-003.
    bought = {"boo-001"}
    seen = {"boo-001", "boo-002", "boo-003"}
    result = rank("user-002", count=6)
    emitted = set(_ids(result))

    assert emitted, "suppression must not empty the response"
    assert not (emitted & bought), f"purchased item in output: {sorted(emitted & bought)}"
    assert not (emitted & seen), f"previously seen item in output: {sorted(emitted & seen)}"
    assert emitted <= {"ele-001", "ele-002", "ele-003"}

    # user-003: a single view of ele-001 is still a suppression.
    light = set(_ids(rank("user-003", count=6)))
    assert light
    assert "ele-001" not in light

    # The ranker does not depend on impressions vs. views here: the same
    # suppression contract holds for any event type in the history.
    for user in ("user-002", "user-003"):
        assert set(_ids(rank(user, count=50))) == set(_ids(rank(user, count=6)))


def test_rank_is_deterministic(
    write_parquet: object,
    trained_model: Path,
) -> None:
    """Identical inputs give deep-equal output, including score ordering."""
    write_parquet()  # type: ignore[operator]
    assert Path(trained_model).is_dir()

    for user in (KNOWN_USER, "user-003", GHOST_USER):
        first = rank(user, context="homepage", count=6, filter="")
        second = rank(user, context="homepage", count=6, filter="")

        assert first == second, f"{user}: rank() is not deterministic"
        assert [(r["item_id"], r["score"], r["reason"]) for r in first["recommendations"]] \
            == [(r["item_id"], r["score"], r["reason"]) for r in second["recommendations"]]

    # The result is a pure function of (user_id, count) in v1: the reserved
    # context/filter arguments do not perturb the ordering.
    assert rank(KNOWN_USER, context="pdp", count=6, filter="price:0-100") == \
        rank(KNOWN_USER, context="homepage", count=6, filter="")
    assert _ids(rank(GHOST_USER, count=6)) == _ids(rank(GHOST_USER, count=50))


def test_zero_history_user_is_trending_cold_start(write_parquet: object) -> None:
    """A user with no history is cold start and served by pure trending."""
    write_parquet()  # type: ignore[operator]

    result = rank(GHOST_USER, count=6)

    assert result["cold_start"] is True
    assert result["strategy"] == Strategy.trending
    assert result["recommendations"], "zero-history users still get recs"
    # No content seed exists, so every row is a popularity row.
    assert {str(row["reason"]) for row in result["recommendations"]} == {"trending"}
    assert set(_ids(result)) == {
        str(row["item_id"]) for row in trending(limit=6)
    }


# --- ALS scoring: real model confidence, not rank position ------------------


def test_als_scores_are_normalised_over_returned_candidates(
    write_parquet: Any, trained_model: Path
) -> None:
    """Returned ALS scores are in [0, 1] with the best candidate at 1.0."""
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    scores = ranker_mod._als_scores("user-001", 10)
    assert scores, "a known user must produce ALS scores"
    assert max(scores.values()) == pytest.approx(1.0)
    # Min-max maps the lowest candidate to exactly 0.0.
    assert all(0.0 <= s <= 1.0 for s in scores.values())


def test_als_scores_exclude_seen_items(
    write_parquet: Any, trained_model: Path
) -> None:
    """Seen items are filtered before scoring, not after."""
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    unfiltered = ranker_mod._als_scores("user-001", 50)
    assert unfiltered
    seen = {next(iter(unfiltered))}
    filtered = ranker_mod._als_scores("user-001", 50, seen=seen)
    assert not (set(filtered) & seen)


def test_als_scores_empty_for_unknown_user_does_not_raise(
    write_parquet: Any, trained_model: Path
) -> None:
    """An unknown user yields {} so the ranker degrades rather than 500s."""
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    assert ranker_mod._als_scores("ghost-nobody", 10) == {}


# --- cold start: every consumed item, and a deterministic content score ----


def test_seed_items_aggregates_every_item_most_recent_first(
    write_parquet: Any, events_frame: pd.DataFrame
) -> None:
    """Cold start seeds from the whole history, not only the newest click."""
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    seeds = ranker_mod._seed_items(events_frame, "user-002")

    # user-002 consumed boo-001 (9d), boo-002 (7d), boo-003 (5d) — every one
    # of them is a seed, most recent first.
    assert seeds == ["boo-003", "boo-002", "boo-001"]
    assert len(seeds) == 3, "one item per interaction, not just the latest"
    assert len(set(seeds)) == len(seeds), "seeds are distinct"

    # The new helper is a strict superset of the old single-seed one: the
    # previous behaviour is still its first element, so nothing regressed.
    assert ranker_mod._seed_item(events_frame, "user-002") == seeds[0]

    # `limit` caps the seed set without reordering it.
    assert ranker_mod._seed_items(events_frame, "user-002", limit=2) == seeds[:2]
    assert ranker_mod._seed_items(events_frame, "user-002", limit=1) == seeds[:1]

    # A user absent from the frame has no seeds at all (never a raise).
    assert ranker_mod._seed_items(events_frame, GHOST_USER) == []


def test_rank_hands_content_similar_many_every_interacted_item(
    write_parquet: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The cold path really passes the user's whole history as the seed set."""
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    assert ranker_mod.rank("user-002", count=6)["cold_start"] is True

    recorded: list[list[str]] = []
    real = ranker_mod.content_similar_many

    def _record(seed_ids: list[str], k: int = 10) -> list[dict]:
        recorded.append(list(seed_ids))
        return real(seed_ids, k=k)

    monkeypatch.setattr(ranker_mod, "content_similar_many", _record)
    result = ranker_mod.rank("user-002", count=6)

    assert recorded, "the cold path never reached content_similar_many"
    assert sorted(recorded[0]) == ["boo-001", "boo-002", "boo-003"]
    assert recorded[0] == ["boo-003", "boo-002", "boo-001"], "most recent first"
    assert result["recommendations"], "the refactored cold path still serves"

