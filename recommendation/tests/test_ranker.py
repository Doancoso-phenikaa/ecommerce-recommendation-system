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

import os
import shutil
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from conftest import EVENT_SPECS, ITEMS, make_event
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

    One DISTINCT item per event, drawn from the whole fixture catalog, so
    the ranker's distinct-item count tracks ``n`` instead of saturating at
    three. The catalog holds 6 items, so the count is ``min(n, 6)``; that
    is still the honest way to pin the boundary, because 6 sits above the
    threshold of 5 while 4 sits below it. (It used to cycle 3 items, which
    made ``min(n, 3)`` distinct -- so n=5 and n=20 both read as cold.)
    """
    catalog = [str(item["item_id"]) for item in ITEMS]
    rows = [
        event_to_row(make_event(user, item, kind, days_ago=days))
        for user, item, kind, days in EVENT_SPECS
    ]
    rows += [
        event_to_row(
            make_event(SWEEP_USER, catalog[k % len(catalog)], days_ago=k + 1)
        )
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


# --- distinct-item cold threshold, and a score-ordered candidate cap --------


def test_cold_start_threshold_counts_distinct_items(
    write_parquet: Any, models_dir: Path
) -> None:
    """Six events over one item is ONE signal, so the user is cold."""
    import pandas as pd

    from recommendation.app import ranker as ranker_mod
    from recommendation.app.consumer import event_to_row
    from recommendation.app.schemas import EventIn, EventType
    from datetime import datetime, timedelta, timezone

    base = datetime(2026, 3, 1, tzinfo=timezone.utc)
    rows = [
        event_to_row(
            EventIn(
                request_id=f"r-{i}",
                user_id="user-repeat",
                item_id="ele-001",
                event_type=EventType.view,
                timestamp=base + timedelta(days=i),
            )
        )
        for i in range(6)
    ]
    write_parquet(events=pd.DataFrame(rows))
    assert ranker_mod._distinct_interactions(pd.DataFrame(rows), "user-repeat") == 1
    assert ranker_mod.rank("user-repeat", count=5)["cold_start"] is True


def test_candidate_cap_keeps_the_top_scoring_item(
    write_parquet: Any, models_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """CANDIDATE_CAP=1 must keep rank()'s own top-1, not a lexicographic id."""
    import pandas as pd

    from recommendation.app import ranker as ranker_mod

    # The cap is only observable when the score order DISAGREES with
    # `sorted()`, so this fixture puts all the trending mass on ``ele-003``
    # -- the last id lexicographically. "u" buys ``zz-001``, an item outside
    # the catalog: it contributes no popularity score (so the other five
    # candidates tie at 0.0) and no content seed (zz-001 has no TF-IDF row).
    # Every ordering decision is therefore carried by ele-003's score alone,
    # and removing the two hot rows silently turns this into a no-op.
    frame = pd.DataFrame(
        [
            {"user_id": "u", "item_id": "zz-001", "event_type": "purchase",
             "timestamp": "2026-03-01T00:00:00+00:00"},
            {"user_id": "hot-1", "item_id": "ele-003", "event_type": "purchase",
             "timestamp": "2026-03-10T00:00:00+00:00"},
            {"user_id": "hot-2", "item_id": "ele-003", "event_type": "purchase",
             "timestamp": "2026-03-11T00:00:00+00:00"},
        ]
    )
    write_parquet(events=frame)

    uncapped = ranker_mod.rank("u", count=10)
    expected_top = uncapped["recommendations"][0]["item_id"]
    # Negative control: the best candidate must NOT be the one the
    # pre-scoring cap would have kept, so a pass cannot be a tie-break
    # coincidence.
    assert expected_top == "ele-003", (
        f"fixture lost its teeth: top-scoring item is {expected_top!r}, "
        "which is also the lexicographic first candidate"
    )

    monkeypatch.setattr(ranker_mod, "CANDIDATE_CAP", 1)
    capped = ranker_mod.rank("u", count=10)
    assert [r["item_id"] for r in capped["recommendations"]] == [expected_top]


# --- Task 1: the cached frame loaders, and the invalidation hook ----------
#
# The loaders take no arguments, so `lru_cache(maxsize=1)` is ONE global slot
# per loader for the whole process. Three things therefore have to hold, and
# each gets its own test below:
#
#   * a second read is served from cache (no second parquet read);
#   * the frame is NOT silently refreshed when the parquet behind it changes
#     (in place, or because the path global was redirected) -- that is the
#     cost of caching, and it is why `invalidate_frame_cache()` exists;
#   * calling the hook really does drop the cached frame, and `rank()` still
#     produces byte-identical output with the cache in place.
#
# `conftest.write_parquet` and the autouse `_reset_globals` both call the hook,
# otherwise a cached frame from one test leaks into the next.

#: Golden ordering captured from a PRE-CHANGE run of this file at commit
#: a83bdcf (before any `lru_cache` landed), via a throwaway probe that called
#: `ranker.rank(user, count=5)` under the unmodified fixture world. It is NOT
#: whatever the cached code returns -- these values were recorded first, and
#: the implementation then had to match them.
#:
#: Each entry is ``(item_ids, strategy, cold_start, scores)``:
#:
#: * ``user-001`` has interacted with every one of the 6 catalog items, so
#:   suppression empties the candidate union and the documented fallback fills
#:   the response with a single trending row. It pins "count=5 does not pad"
#:   and the fallback's first-match order. (Degraded: the fixture models dir
#:   has a ``v1`` pointer but no ``als_v1`` artifacts behind it.)
#: * ``user-002`` (3 events) and ``user-003`` (1 event) are cold-start, so
#:   they exercise the content+trending blend and the diversity reorder.
#: * ``ghost-user-xyz`` has no history, so it is pure trending -- the
#:   unsuppressed, unsorted-by-score baseline ordering.
#:
#: Scores are deterministic across calendar days: `baseline.trending` derives
#: its reference time from the newest event in the frame
#: (`baseline.trending` -> `_as_now(now, latest)`), not from wall clock.
GOLDEN_RANK_OUTPUT: dict[str, tuple[list[str], str, bool, list[float]]] = {
    "user-001": (["boo-003"], "degraded", False, [0.2]),
    "user-002": (
        ["ele-001", "ele-002"],
        "content",
        True,
        [0.33990862857953197, 0.3111316180044972],
    ),
    "user-003": (
        ["ele-002", "boo-003", "boo-001", "ele-003", "boo-002"],
        "content",
        True,
        [
            0.3111316180044972,
            0.2,
            0.1390244169775452,
            0.1374294007985954,
            0.04151021000275242,
        ],
    ),
    "ghost-user-xyz": (
        ["boo-003", "boo-001", "ele-001", "ele-003", "boo-002"],
        "trending",
        True,
        [
            0.2,
            0.09523620308901062,
            0.039908628579531986,
            0.025682089733064125,
            0.04151021000275242,
        ],
    ),
}


def test_frame_cache_serves_the_second_read(write_parquet: Any) -> None:
    """Two loads return the same cached object -- no second parquet read."""
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    first = ranker_mod._load_items_df()
    second = ranker_mod._load_items_df()
    assert first is second

    first_ev = ranker_mod._load_interactions_df()
    assert first_ev is ranker_mod._load_interactions_df()


def test_invalidate_frame_cache_forces_a_reload(
    write_parquet: Any, data_dir: Path
) -> None:
    """The hook still forces a fresh read even when the cache key has not moved.

    That is its whole job after Task 3b: it is the explicit backstop for a
    rewrite the file fingerprint cannot see. The tests below also pin the
    new half of the contract -- an ordinary in-place rewrite IS now visible
    without the hook.
    """
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    first = ranker_mod._load_items_df()
    assert not first.empty

    ranker_mod.invalidate_frame_cache()
    second = ranker_mod._load_items_df()
    assert second is not first, "invalidate_frame_cache() did not drop the entry"
    assert len(second) == len(first)

    _rewrite_in_place(
        data_dir / "items.parquet",
        pd.DataFrame(
            [{"item_id": "new-001", "category_path": ["books"],
              "price_cents": 1, "available": True}]
        ),
    )
    assert ranker_mod._load_items_df()["item_id"].astype(str).tolist() == ["new-001"]


def test_frame_cache_follows_a_path_redirect(
    write_parquet: Any, data_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Redirecting the path global swaps the frame -- the path is in the key.

    Task 1 pinned the opposite contract (a redirect kept serving the old
    frame until the hook ran) because the key was the empty tuple. The
    hazard that motivated it -- serving a catalog that no longer exists --
    is exactly what Task 3b removes, so the assertion is inverted and the
    hook is still exercised as the explicit reload.
    """
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    first = ranker_mod._load_items_df()
    assert "new-001" not in first["item_id"].astype(str).tolist()

    # Parquet B: a different file, at a different path, with a different row.
    other = data_dir / "items_other.parquet"
    pd.DataFrame(
        [{"item_id": "new-001", "category_path": ["books"],
          "price_cents": 1, "available": True}]
    ).to_parquet(other, index=False)
    monkeypatch.setattr(ranker_mod, "_ITEMS_PARQUET", other)

    after = ranker_mod._load_items_df()
    assert after is not first
    assert after["item_id"].astype(str).tolist() == ["new-001"]

    ranker_mod.invalidate_frame_cache()
    assert ranker_mod._load_items_df() is not after, (
        "invalidate_frame_cache() no longer forces a reload"
    )


def test_rank_still_works_with_caching(
    write_parquet: Any, models_dir: Path
) -> None:
    """Caching must not change the served result, checked against a golden.

    Comparing `rank()` to itself would pass with or without caching, so the
    expected ordering is pinned as the literal in :data:`GOLDEN_RANK_OUTPUT`,
    captured from a pre-change run of this file at commit ``a83bdcf`` before
    any cache existed. The invariants below are kept only as a second net --
    on their own they hold with or without caching and prove nothing.
    """
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    catalog_ids = set(
        ranker_mod._load_items_df()["item_id"].astype(str).tolist()
    )
    interactions = ranker_mod._load_interactions_df()

    for user, (want_ids, want_strategy, want_cold, want_scores) in (
        GOLDEN_RANK_OUTPUT.items()
    ):
        resp = ranker_mod.rank(user, count=5)
        ids = [r["item_id"] for r in resp["recommendations"]]
        scores = [r["score"] for r in resp["recommendations"]]

        assert ids == want_ids, f"{user}: served ordering moved"
        assert resp["strategy"] == want_strategy, f"{user}: strategy moved"
        assert resp["cold_start"] is want_cold, f"{user}: cold_start flag moved"
        assert scores == pytest.approx(want_scores, rel=1e-12), (
            f"{user}: served scores moved"
        )

        # Second net: the invariants, which hold with or without caching.
        assert len(ids) == len(set(ids)) <= 5
        assert all(i in catalog_ids for i in ids)

        # Suppression, with its one documented exception. ``rank()`` falls
        # back to the popularity list *ignoring* suppression when a user has
        # consumed the whole catalog (``user-001`` has: 6 of 6), so the
        # non-suppression invariant is asserted only where it can hold, and
        # the exception's precondition is asserted to be the real one.
        suppressed = set(ranker_mod._user_item_ids(interactions, user))
        if suppressed >= catalog_ids:
            assert suppressed == catalog_ids, (
                f"{user}: ignore-suppression fallback claimed, but the user "
                "has not consumed the whole catalog"
            )
        else:
            assert not (set(ids) & suppressed), f"{user}: served a suppressed id"



# --- Task 2: single-pass user slice ------------------------------------------


def test_consumed_rows_excludes_passive_events() -> None:
    """The shared slice drops impression/search, like _user_item_ids did."""
    import pandas as pd

    from recommendation.app import ranker as ranker_mod

    frame = pd.DataFrame(
        [
            {"user_id": "u", "item_id": "a", "event_type": "view",
             "timestamp": "2026-03-01T00:00:00+00:00"},
            {"user_id": "u", "item_id": "b", "event_type": "impression",
             "timestamp": "2026-03-02T00:00:00+00:00"},
            {"user_id": "u", "item_id": "c", "event_type": "purchase",
             "timestamp": "2026-03-03T00:00:00+00:00"},
        ]
    )
    rows = ranker_mod._consumed_rows(frame, "u")
    assert sorted(rows["item_id"].tolist()) == ["a", "c"]


def test_consumed_rows_orders_most_recent_first() -> None:
    """Ordering is stable and newest-first, ties broken by item_id."""
    import pandas as pd

    from recommendation.app import ranker as ranker_mod

    frame = pd.DataFrame(
        [
            {"user_id": "u", "item_id": "old", "event_type": "view",
             "timestamp": "2026-03-01T00:00:00+00:00"},
            {"user_id": "u", "item_id": "b-new", "event_type": "view",
             "timestamp": "2026-03-05T00:00:00+00:00"},
            {"user_id": "u", "item_id": "a-new", "event_type": "view",
             "timestamp": "2026-03-05T00:00:00+00:00"},
        ]
    )
    rows = ranker_mod._consumed_rows(frame, "u")
    assert rows["item_id"].tolist() == ["a-new", "b-new", "old"]


def test_consumed_rows_covers_exactly_the_interacted_items() -> None:
    """The shared slice is the whole contract: every consumer reads it."""
    import pandas as pd

    from recommendation.app import ranker as ranker_mod

    frame = pd.DataFrame(
        [
            {"user_id": "u", "item_id": "a", "event_type": "view",
             "timestamp": "2026-03-01T00:00:00+00:00"},
            {"user_id": "u", "item_id": "b", "event_type": "impression",
             "timestamp": "2026-03-02T00:00:00+00:00"},
            {"user_id": "other", "item_id": "z", "event_type": "view",
             "timestamp": "2026-03-03T00:00:00+00:00"},
        ]
    )
    consumed = ranker_mod._consumed_rows(frame, "u")
    # Both consumers must agree with the slice, not re-derive it.
    assert ranker_mod._user_item_ids_from_rows(consumed) == ["a"]
    assert ranker_mod._seed_items_from_rows(consumed) == ["a"]
    # And the frame-taking wrappers must produce the same answer.
    assert ranker_mod._user_item_ids(frame, "u") == ["a"]
    assert ranker_mod._seed_items(frame, "u") == ["a"]


# --- Task 3b: the frame caches are self-invalidating ------------------------
#
# Task 1 shipped `lru_cache(maxsize=1)` on arity-0 loaders, so the cache key
# was the empty tuple. `consumer.merge_batches` replaces the parquet IN PLACE
# (temp file + `os.replace`), so the path never changed, the key never
# changed, and nothing ever evicted the entry: a long-lived server pinned the
# catalog and the suppression sets at whatever the parquet held at first
# request, with no error and no warning.
#
# The loaders now fingerprint the file and key on that, so an ordinary
# rewrite is visible. The fingerprint is an OPTIMISATION that makes staleness
# unlikely, not impossible -- a rewrite landing inside the same
# `st_mtime_ns` tick at the same `st_size` is invisible to it, which is why
# `invalidate_frame_cache()` remains the correctness backstop.


def _rewrite_in_place(path: Path, frame: pd.DataFrame) -> None:
    """Replace *path* the way ``consumer.merge_batches`` does: tmp + replace."""
    tmp = path.with_suffix(".tmp")
    frame.to_parquet(tmp, index=False)
    os.replace(tmp, path)


def test_frame_cache_reloads_when_the_parquet_is_rewritten(
    write_parquet: Any, data_dir: Path
) -> None:
    """An in-place retrain rewrite must be visible WITHOUT the explicit hook.

    The hazard this pins: the loader took no arguments, so the key was the
    empty tuple and nothing could ever evict the entry.
    """
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    before = ranker_mod._load_items_df()
    assert len(before) == 6

    _rewrite_in_place(
        data_dir / "items.parquet",
        pd.DataFrame(
            [{"item_id": "new-001", "category_path": ["books"],
              "price_cents": 1, "available": True}]
        ),
    )

    after = ranker_mod._load_items_df()
    assert len(after) == 1, "the frame cache served a catalog that no longer exists"
    assert after is not before
    assert after["item_id"].astype(str).tolist() == ["new-001"]


def test_interactions_frame_cache_reloads_when_the_parquet_is_rewritten(
    write_parquet: Any, data_dir: Path
) -> None:
    """The suppression-set source has the same exposure and the same fix."""
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    before = ranker_mod._load_interactions_df()
    assert len(before) == 10

    _rewrite_in_place(
        data_dir / "interactions.parquet",
        pd.DataFrame(
            [{"request_id": "r1", "user_id": "user-001", "item_id": "ele-001",
              "event_type": "view", "timestamp": "2026-03-01T00:00:00+00:00"}]
        ),
    )

    after = ranker_mod._load_interactions_df()
    assert len(after) == 1, "the frame cache served an event log that no longer exists"
    assert after is not before
    assert ranker_mod._user_item_ids(after, "user-001") == ["ele-001"]


def test_frame_cache_notices_a_rewrite_that_keeps_the_row_count(
    write_parquet: Any, data_dir: Path
) -> None:
    """Row count is not the signal; the file's identity is.

    A retrain that reorders or re-labels the catalog keeps the row count, so
    an implementation that only compared lengths would still serve stale rows.
    """
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    catalog = pd.DataFrame(ITEMS)
    before = ranker_mod._load_items_df()
    assert len(before) == len(catalog)

    renamed = catalog.assign(
        item_id=catalog["item_id"].str.replace("ele", "ela").str.replace("boo", "bax")
    )
    _rewrite_in_place(data_dir / "items.parquet", renamed)

    after = ranker_mod._load_items_df()
    assert len(after) == len(before), "row count is meant to be unchanged"
    assert after["item_id"].astype(str).tolist() == renamed["item_id"].tolist()


def test_frame_loaders_still_expose_a_working_cache_clear() -> None:
    """``evaluate._drop_frame_caches`` calls ``loader.cache_clear()``.

    It fetches the attribute with ``getattr(..., None)`` and skips anything
    that returns None, so if this regressed the gate would silently stop
    invalidating and re-serve a stale frame -- no exception, no test failure
    elsewhere. ``evaluate.py`` is out of scope for this change, so the
    contract is pinned from this side instead.
    """
    from recommendation.app import ranker as ranker_mod

    for loader in (ranker_mod._load_items_df, ranker_mod._load_interactions_df):
        clear = getattr(loader, "cache_clear", None)
        assert callable(clear), f"{loader.__name__} lost its cache_clear()"
        assert clear() is None, f"{loader.__name__}.cache_clear() must return None"


def test_cache_clear_on_the_public_loaders_really_drops_the_entry(
    write_parquet: Any
) -> None:
    """Not just present -- calling it must evict, which is what callers rely on."""
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    first_items = ranker_mod._load_items_df()
    first_events = ranker_mod._load_interactions_df()

    ranker_mod.invalidate_frame_cache()

    assert ranker_mod._load_items_df() is not first_items
    assert ranker_mod._load_interactions_df() is not first_events


def test_frame_cache_keeps_the_current_and_previous_fingerprint(
    write_parquet: Any, data_dir: Path
) -> None:
    """``maxsize=2`` -- a read straddling a rewrite must not thrash.

    With ``maxsize=1`` the rewrite evicts the entry the in-flight reader is
    about to ask for, so two rewrites in quick succession turn every read
    into a parquet load.
    """
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    first = ranker_mod._load_items_df()
    _rewrite_in_place(
        data_dir / "items.parquet",
        pd.DataFrame(ITEMS).assign(
            item_id=lambda f: f["item_id"].str.replace("ele", "ela")
        ),
    )
    second = ranker_mod._load_items_df()
    assert second is not first
    assert ranker_mod._load_items_df() is second, "the current key must be cached"

    info = ranker_mod._load_items_df_cached.cache_info()
    assert info.currsize == 2, f"expected current + previous, got {info}"
    assert info.maxsize == 2


def test_parquet_fingerprint_is_none_for_a_missing_path(tmp_path: Path) -> None:
    """A path that does not exist must fingerprint to None, not raise.

    The loader then raises from ``read_parquet`` exactly as it did before,
    which is what keeps the failure mode of a missing file unchanged.
    """
    from recommendation.app import ranker as ranker_mod

    assert ranker_mod._parquet_fingerprint(tmp_path / "absent.parquet") is None
    assert ranker_mod._parquet_fingerprint(tmp_path / "no" / "such" / "x.parquet") is None


def test_invalidate_frame_cache_is_the_backstop_the_fingerprint_cannot_be(
    write_parquet: Any, data_dir: Path
) -> None:
    """The documented residual, pinned: same ``st_mtime_ns`` AND same ``st_size``.

    ``consumer``'s rewrite discipline plus a restored mtime reproduces a
    rewrite the fingerprint genuinely cannot see, and the assertion is that
    ``invalidate_frame_cache()`` still recovers from it. This is the honest
    boundary of the design: the fingerprint makes staleness unlikely, the
    hook makes it recoverable.
    """
    from recommendation.app import ranker as ranker_mod

    write_parquet()
    catalog_path = data_dir / "items.parquet"
    before = ranker_mod._load_items_df()

    st = os.stat(catalog_path)
    renamed = pd.DataFrame(ITEMS).assign(
        item_id=lambda f: f["item_id"].str.replace("ele", "ela").str.replace("boo", "bax")
    )
    _rewrite_in_place(catalog_path, renamed)
    os.utime(catalog_path, ns=(st.st_atime_ns, st.st_mtime_ns))

    assert os.stat(catalog_path).st_size == st.st_size, "fixture lost its teeth"
    assert ranker_mod._parquet_fingerprint(catalog_path) == (
        st.st_mtime_ns,
        st.st_size,
    )
    assert ranker_mod._load_items_df() is before, (
        "an unchanged fingerprint is served from cache -- that is the residual"
    )

    ranker_mod.invalidate_frame_cache()
    recovered = ranker_mod._load_items_df()
    assert recovered is not before
    assert recovered["item_id"].astype(str).tolist() == renamed["item_id"].tolist()


def test_invalidate_frame_cache_before_any_load_is_a_no_op() -> None:
    """The hook must be safe on a cold process -- conftest calls it autouse."""
    from recommendation.app import ranker as ranker_mod

    assert ranker_mod.invalidate_frame_cache() is None
    assert ranker_mod.invalidate_frame_cache() is None
