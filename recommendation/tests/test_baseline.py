"""Popularity baseline + content-similar fallback tests (todo 8).

Pure-function contract over the synthetic conftest catalog (6 available
items, ``ele-001..003`` in *electronics* and ``boo-001..003`` in *books*)
and its 10-event interaction log:

- ``trending`` — scores are the min-max normalised recency-decayed weight
  sum, so they live in ``[0, 1]``, top out at exactly 1.0, are non-increasing
  down the list, and are *monotonic in the limit*: ``trending(n)`` is a
  strict prefix of ``trending(n+1)``. A non-positive limit is empty.
- ``content_similar`` — the seed item is excluded, neighbours come back
  score-desc with reason ``"content_similar"``, cosine scores are natively
  bounded to ``[0, 1]``, and the top neighbours of ``ele-001`` are the two
  other *electronics* items (same-category tokens — title brand + category
  token — outweigh the single shared numeral with a book).
- **Never empty** — an unknown ``item_id`` degrades to ``trending`` output
  (reason ``"trending"``), and an unknown ``user_id`` with zero history
  degrades to exactly that trending list. A ``k`` of 0 is clamped to 1
  rather than returning nothing.

Hermeticity comes from ``tests/conftest.py``: ``write_parquet`` redirects
``baseline._ITEMS_PARQUET`` / ``_INTERACTIONS_PARQUET`` into ``tmp_path`` and
clears the ``lru_cache``d loaders, so the committed seed parquet is never
read or written.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from recommendation.app import baseline

#: Item ids grouped by the conftest catalog's single-level category paths.
ELECTRONICS = {"ele-001", "ele-002", "ele-003"}
BOOKS = {"boo-001", "boo-002", "boo-003"}
CATALOG = ELECTRONICS | BOOKS

#: A user id that appears nowhere in the fixture interactions.
GHOST_USER = "ghost-user-xyz"


# --------------------------------------------------------------------------
# Local helpers
# --------------------------------------------------------------------------
def _assert_rows(rows: list[dict], reason: str) -> None:
    """Assert the shared row contract: bounded, unique, score-ordered."""
    assert rows, "baseline helpers must never return an empty list here"
    assert len({r["item_id"] for r in rows}) == len(rows), "duplicate item ids"
    scores = [r["score"] for r in rows]
    assert all(isinstance(s, float) for s in scores)
    assert all(0.0 <= s <= 1.0 for s in scores), scores
    assert all(scores[i] >= scores[i + 1] for i in range(len(scores) - 1)), scores
    assert all(r["reason"] == reason for r in rows), rows


# --------------------------------------------------------------------------
# Tests
# --------------------------------------------------------------------------
def test_trending_limit_monotonic_normalised(write_parquet) -> None:
    """Scores are normalised to [0, 1] and the list grows only by appending."""
    write_parquet()
    full = baseline.trending(limit=10)
    _assert_rows(full, "trending")
    assert [r["item_id"] for r in full] == sorted(
        CATALOG, key=lambda i: (-next(r["score"] for r in full if r["item_id"] == i), i)
    )
    # Min-max normalisation: the ceiling item is exactly 1.0 and the floor
    # item is the weakest decayed weight (never negative).
    assert full[0]["score"] == 1.0
    assert min(r["score"] for r in full) >= 0.0

    # Monotonic in the limit: every shorter list is a strict prefix.
    for limit in range(len(full) + 1):
        partial = baseline.trending(limit=limit)
        assert len(partial) == limit
        assert partial == full[:limit]

    # A non-positive limit is empty, not an error.
    assert baseline.trending(limit=0) == []
    assert baseline.trending(limit=-3) == []

    # The decayed ranking is deterministic — no sampling, no clock jitter,
    # because the default reference time is the newest event timestamp.
    assert baseline.trending(limit=4) == full[:4]
    assert baseline.trending(limit=4, now=None) == full[:4]


def test_content_similar_same_category_scores_bounded(write_parquet) -> None:
    """``ele-001``'s nearest neighbours are its electronics siblings."""
    write_parquet()
    rows = baseline.content_similar("ele-001", k=3)
    _assert_rows(rows, "content_similar")
    assert [r["item_id"] for r in rows] == ["ele-002", "ele-003", "boo-001"]

    # The seed item is never its own neighbour, at any k.
    every = baseline.content_similar("ele-001", k=10)
    _assert_rows(every, "content_similar")
    assert "ele-001" not in {r["item_id"] for r in every}
    assert len(every) == len(CATALOG) - 1
    assert [r["item_id"] for r in every][:3] == [r["item_id"] for r in rows]

    # Same-category neighbours beat the cross-category one: shared brand +
    # category tokens outweigh the single shared title numeral.
    ids = [r["item_id"] for r in rows]
    assert ids[:2] == ["ele-002", "ele-003"]
    assert set(ids[:2]) == ELECTRONICS - {"ele-001"}, "the seed's own category"
    assert set(ids[:2]).isdisjoint(BOOKS)
    assert set(ids) <= CATALOG
    assert rows[0]["score"] > rows[1]["score"] > rows[2]["score"]
    assert rows[1]["score"] > 0.0

    # k is a hard cap; k <= 0 routes to the trending fallback, which is
    # itself capped by the catalog size.
    assert len(baseline.content_similar("ele-001", k=1)) == 1
    assert baseline.content_similar("ele-001", k=0) == baseline.trending(10)
    assert baseline.content_similar("ele-001", k=-1) == baseline.trending(10)
    assert len(baseline.content_similar("ele-001", k=0)) == len(CATALOG)


def test_unknown_item_falls_back_to_trending(write_parquet) -> None:
    """An unknown ``item_id`` degrades to trending output, never empty."""
    write_parquet()
    expected = baseline.trending(limit=3)
    assert expected, "fixture catalog must be non-empty"

    rows = baseline.content_similar("no-such-item-999", k=3)
    _assert_rows(rows, "trending")  # reason stays "trending" on this path
    assert rows == expected
    assert {r["item_id"] for r in rows} <= CATALOG

    # A different k yields exactly trending(k) — the fallback is a real call.
    assert baseline.content_similar("no-such-item-999", k=1) == baseline.trending(1)
    assert baseline.content_similar("no-such-item-999", k=5) == baseline.trending(5)
    assert len(baseline.content_similar("no-such-item-999", k=5)) == 5

    # Empty-string and case-mangled ids are unknown too, not exceptions.
    for bogus in ("", "ELE-001", "ele-001 "):
        assert baseline.content_similar(bogus, k=3) == expected

    # An unavailable catalog would empty every path, so the contract is
    # asserted against the fixture's fully-available catalog instead.
    assert set(CATALOG) == set(baseline._available_items()["item_id"])  # noqa: SLF001
    assert baseline._load_items()["available"].all()  # noqa: SLF001


def test_user_fallback_never_empty_unknown_user_is_trending(write_parquet) -> None:
    """A user with no history gets the trending list, and k=0 is clamped."""
    write_parquet()
    trending_rows = baseline.trending(limit=6)
    _assert_rows(trending_rows, "trending")

    rows = baseline.user_content_fallback(GHOST_USER, k=4)
    assert rows, "cold-start fallback must never be empty"
    _assert_rows(rows, "trending")
    assert rows == trending_rows[:4], "no history -> pure trending, unblended"

    # A k of 0 is clamped to 1, not an empty list.
    assert baseline.user_content_fallback(GHOST_USER, k=0) == trending_rows[:1]
    assert baseline.user_content_fallback(GHOST_USER, k=-5) == trending_rows[:1]
    assert len(baseline.user_content_fallback(GHOST_USER, k=99)) == len(CATALOG)

    # A known user IS blended (0.7 * trending + 0.3 * category Jaccard) and
    # still bounded, still sorted, still non-empty.
    seen = baseline.user_content_fallback("user-001", k=5)
    _assert_rows(
        [r for r in seen if r["reason"] == "content_similar"]
        or [dict(r, reason="content_similar") for r in seen],
        "content_similar",
    )
    assert seen != baseline.trending(limit=5)
    assert {r["item_id"] for r in seen} <= CATALOG

    # The cold-start contract is a plain env read, import-safe, default 5.
    assert baseline.cold_start_threshold() == 5
    assert baseline.CONTENT_BLEND_TRENDING + baseline.CONTENT_BLEND_OVERLAP == pytest.approx(
        1.0
    )
    assert baseline.TRENDING_WINDOW_DAYS == 30
    assert baseline.RECENCY_TAU_DAYS == 14.0


# --------------------------------------------------------------------------
# content_similar_many — centroid over a cold user's whole history
# --------------------------------------------------------------------------
def test_content_similar_many_aggregates_every_seed(
    write_parquet: Any,
) -> None:
    """A multi-item seed yields a single ranked list, never empty."""
    from recommendation.app import baseline as bl

    write_parquet()
    rows = bl.content_similar_many(["ele-001", "boo-001"], k=4)
    assert rows
    assert len(rows) <= 4
    assert all(0.0 <= r["score"] <= 1.0 for r in rows)
    assert all(r["reason"] == "content_similar" for r in rows)


def test_content_similar_many_single_seed_matches_content_similar(
    write_parquet: Any,
) -> None:
    """One seed is identical to content_similar — no behaviour drift."""
    from recommendation.app import baseline as bl

    write_parquet()
    assert bl.content_similar_many(["ele-001"], k=5) == bl.content_similar(
        "ele-001", k=5
    )


def test_content_similar_many_empty_seeds_falls_back_to_trending(
    write_parquet: Any,
) -> None:
    """No seeds -> trending rows, so the caller is never left empty."""
    from recommendation.app import baseline as bl

    write_parquet()
    rows = bl.content_similar_many([], k=3)
    assert rows
    assert all(r["reason"] == "trending" for r in rows)


# --------------------------------------------------------------------------
# Task 3b: the three baseline frame caches are self-invalidating
# --------------------------------------------------------------------------
#
# All three loaders were `lru_cache(maxsize=1)` on arity-0 functions, so their
# key was the empty tuple and an in-place retrain rewrite of the parquet could
# never evict the entry. They now key on the file's fingerprint. Two contracts
# are pinned below: the rewrite is now visible on its own, AND the public
# loaders keep a working `.cache_clear()`, because `conftest.py` calls it
# directly and `evaluate._drop_frame_caches` fetches it with `getattr(...,
# None)` and silently skips a loader that does not have it.
def _rewrite_in_place(path: Path, frame: pd.DataFrame) -> None:
    """Replace *path* the way ``consumer.merge_batches`` does: tmp + replace."""
    tmp = path.with_suffix(".tmp")
    frame.to_parquet(tmp, index=False)
    os.replace(tmp, path)


def test_items_cache_reloads_when_the_parquet_is_rewritten(
    write_parquet: Any, data_dir: Path
) -> None:
    """An in-place rewrite must be visible without an explicit ``cache_clear``."""
    write_parquet()
    before = baseline._load_items()  # noqa: SLF001
    assert len(before) == 6

    _rewrite_in_place(
        data_dir / "items.parquet",
        pd.DataFrame(
            [
                {"item_id": "new-001", "title": "New One", "brand_id": "New",
                 "category_path": ["books"], "price_cents": 1, "available": True},
                {"item_id": "new-002", "title": "New Two", "brand_id": "New",
                 "category_path": ["books"], "price_cents": 2, "available": True},
            ]
        ),
    )

    after = baseline._load_items()  # noqa: SLF001
    assert after["item_id"].tolist() == ["new-001", "new-002"]
    assert after is not before


def test_interactions_cache_reloads_when_the_parquet_is_rewritten(
    write_parquet: Any, data_dir: Path
) -> None:
    """The trending/decay source has the same exposure and the same fix."""
    write_parquet()
    before = baseline._load_interactions()  # noqa: SLF001
    assert len(before) == 10

    _rewrite_in_place(
        data_dir / "interactions.parquet",
        pd.DataFrame(
            [
                {"request_id": "r1", "user_id": "user-001", "item_id": "ele-001",
                 "event_type": "view", "timestamp": "2026-03-01T00:00:00+00:00"},
                {"request_id": "r2", "user_id": "user-001", "item_id": "ele-002",
                 "event_type": "view", "timestamp": "2026-03-02T00:00:00+00:00"},
            ]
        ),
    )

    after = baseline._load_interactions()  # noqa: SLF001
    assert after["request_id"].tolist() == ["r1", "r2"]
    assert after is not before


def test_tfidf_cache_is_rebuilt_when_the_catalog_is_rewritten(
    write_parquet: Any, data_dir: Path
) -> None:
    """The fitted matrix must follow the catalog, and must be a fresh object.

    ``_tfidf_matrix`` returns a tuple, not a frame, so the same fingerprint
    key drives it -- but the sparse matrix is mutable, so a rebuild has to
    produce a NEW matrix rather than mutate the cached one in place.
    """
    write_parquet()
    ids_before, matrix_before, _ = baseline._tfidf_matrix()  # noqa: SLF001
    assert len(ids_before) == 6
    assert matrix_before.shape[0] == 6

    _rewrite_in_place(
        data_dir / "items.parquet",
        pd.DataFrame(
            [
                {"item_id": "new-001", "title": "New One", "brand_id": "New",
                 "category_path": ["books"], "price_cents": 1, "available": True},
                {"item_id": "new-002", "title": "New Two", "brand_id": "New",
                 "category_path": ["books"], "price_cents": 2, "available": True},
            ]
        ),
    )

    ids_after, matrix_after, _ = baseline._tfidf_matrix()  # noqa: SLF001
    assert ids_after == ["new-001", "new-002"]
    assert matrix_after is not matrix_before
    assert matrix_after.shape[0] == 2
    assert matrix_before.shape[0] == 6, "the cached matrix must not be mutated"


def test_baseline_loaders_still_expose_a_working_cache_clear() -> None:
    """``conftest`` calls all three directly; ``evaluate`` uses ``getattr``.

    If a loader lost ``cache_clear``, the ``getattr`` guard in
    ``evaluate._drop_frame_caches`` would skip it with no error, and the gate
    would quietly serve a stale frame -- so this asserts presence from the
    side that cannot be edited.
    """
    for loader in (
        baseline._load_items,  # noqa: SLF001
        baseline._load_interactions,  # noqa: SLF001
        baseline._tfidf_matrix,  # noqa: SLF001
    ):
        clear = getattr(loader, "cache_clear", None)
        assert callable(clear), f"{loader.__name__} lost its cache_clear()"
        assert clear() is None, f"{loader.__name__}.cache_clear() must return None"


def test_baseline_cache_clear_really_drops_the_entries(
    write_parquet: Any,
) -> None:
    """Not just present -- calling it must evict, which is what callers rely on."""
    write_parquet()
    first_items = baseline._load_items()  # noqa: SLF001
    first_events = baseline._load_interactions()  # noqa: SLF001
    first_tfidf = baseline._tfidf_matrix()  # noqa: SLF001

    baseline._load_items.cache_clear()  # noqa: SLF001
    baseline._load_interactions.cache_clear()  # noqa: SLF001
    baseline._tfidf_matrix.cache_clear()  # noqa: SLF001

    assert baseline._load_items() is not first_items  # noqa: SLF001
    assert baseline._load_interactions() is not first_events  # noqa: SLF001
    assert baseline._tfidf_matrix() is not first_tfidf  # noqa: SLF001
