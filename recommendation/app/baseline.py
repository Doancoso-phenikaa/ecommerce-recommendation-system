"""Popularity baseline + content-similar recommendations (todo 8).

Three pure functions over the seed Parquet files — no ALS, no Kafka, no
Redis; Parquet-only so they work with the Docker daemon down.

Score formulae (documented here as the single source of truth):

- ``trending``: for each event in the trailing 30-day window
  ``weight = EVENT_WEIGHTS[event_type] * exp(-age_days / 14)`` where
  ``age_days = (now - timestamp).total_seconds() / 86400`` clamped at >= 0
  (future timestamps count as age 0). Decay choice: ``exp(-age/14)`` — a
  14-day half-life-ish smooth decay (weight halves every ~9.7 days) that
  favours recent hype without cliff effects. Raw per-item sums are then
  min-max normalised to [0, 1] (top item = 1.0); a zero-max (no events in
  window) falls back to the full history, and if that is also empty every
  available item scores 0.0. Only ``available=True`` items are returned,
  sorted by score desc with ``item_id`` asc as deterministic tie-break.
  No randomness anywhere (SEED irrelevant — nothing samples).

- ``content_similar``: ``sklearn`` ``TfidfVectorizer`` over the document
  ``"<title> <category_path tokens> <brand_id>"`` per item, cosine
  similarity, EXHAUSTIVE scan (catalog < 2000 rows per self-grill — no ANN,
  no faiss). Cosine scores are natively in [0, 1]. The query item itself
  is excluded; only ``available=True`` neighbours are returned, sorted by
  score desc with ``item_id`` asc tie-break.

- ``user_content_fallback``: for users with fewer than
  ``COLD_START_MAX_INTERACTIONS`` interactions (default 5, read from the
  env var directly so importing this module never requires REDIS_URL /
  MODEL_DIR): ``score = 0.7 * trending_norm + 0.3 * category_jaccard``
  where ``category_jaccard`` is the max Jaccard overlap between the
  candidate's ``category_path`` set and each seen item's set (1.0 = same
  categories, 0.0 = disjoint). Items with overlap > 0 get
  reason ``"content_similar"``, the rest ``"trending"``.

Fallback contract: these functions NEVER return an empty list while the
catalog has available items — unknown ``item_id`` / unknown ``user_id`` /
user with zero history all degrade to :func:`trending` output (the caller
maps that to ``strategy=trending``; ``SimilarResponse`` has no
``cold_start`` field, so nothing extra is signalled).
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from recommendation.app.bus import EVENT_WEIGHTS

__all__ = [
    "TRENDING_WINDOW_DAYS",
    "RECENCY_TAU_DAYS",
    "CONTENT_BLEND_TRENDING",
    "CONTENT_BLEND_OVERLAP",
    "cold_start_threshold",
    "trending",
    "content_similar",
    "user_content_fallback",
]

#: Trailing window for trending, in days.
TRENDING_WINDOW_DAYS = 30

#: Recency decay time-constant: weight *= exp(-age_days / TAU).
RECENCY_TAU_DAYS = 14.0

#: Blend weights for user_content_fallback (must sum to 1.0).
CONTENT_BLEND_TRENDING = 0.7
CONTENT_BLEND_OVERLAP = 0.3

_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
_ITEMS_PARQUET = _DATA_DIR / "items.parquet"
_INTERACTIONS_PARQUET = _DATA_DIR / "interactions.parquet"

#: Static weight per raw event_type string, derived once from bus.EVENT_WEIGHTS
#: (single source of truth for weights — never duplicated by hand).
_STATIC_WEIGHTS: dict[str, float] = {
    et.value: float(w) for et, w in EVENT_WEIGHTS.items()
}


def cold_start_threshold() -> int:
    """Return COLD_START_MAX_INTERACTIONS without requiring service env.

    Reads the ``COLD_START_MAX_INTERACTIONS`` env var (default ``"5"``,
    matching ``config.load_settings``); falls back to 5 on missing or
    unparsable values so Parquet-only callers never need REDIS_URL /
    MODEL_DIR set.
    """
    raw = os.getenv("COLD_START_MAX_INTERACTIONS", "5")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 5


def _parse_ts(value: object) -> datetime | None:
    """Parse a parquet timestamp cell to an aware datetime, else None."""
    if value is None:
        return None
    try:
        ts = pd.Timestamp(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(ts):
        return None
    dt = ts.to_pydatetime()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _as_now(now: datetime | str | None, fallback: datetime) -> datetime:
    """Coerce ``now`` to an aware datetime (default: ``fallback``)."""
    if now is None:
        return fallback
    if isinstance(now, datetime):
        return now if now.tzinfo is not None else now.replace(tzinfo=timezone.utc)
    parsed = _parse_ts(now)
    return parsed if parsed is not None else fallback


@lru_cache(maxsize=1)
def _load_items() -> pd.DataFrame:
    """Load the items catalog (cached; call ``_load_items.cache_clear()``)."""
    return pd.read_parquet(_ITEMS_PARQUET)


@lru_cache(maxsize=1)
def _load_interactions() -> pd.DataFrame:
    """Load the interactions log (cached; ``_load_interactions.cache_clear()``)."""
    return pd.read_parquet(_INTERACTIONS_PARQUET)


def _available_items(items: pd.DataFrame | None = None) -> pd.DataFrame:
    """Return available catalog rows (never empty unless catalog has none)."""
    df = items if items is not None else _load_items()
    avail = df[df["available"].astype(bool)].copy()
    return avail.sort_values("item_id").reset_index(drop=True)


def _trending_raw(now: datetime) -> dict[str, float]:
    """Raw (unnormalised) trending scores over the trailing 30d window.

    Falls back to the full history when the window holds no events, and to
    ``{}`` when there are no parseable events at all (caller then emits
    zero-scored available items so the result is never empty).
    """
    ev = _load_interactions()
    if ev.empty:
        return {}
    stamps = ev["timestamp"].map(_parse_ts)
    weights = ev["event_type"].map(
        lambda e: _STATIC_WEIGHTS.get(str(e), 0.0)
    )
    valid = stamps.notna()
    ev = ev[valid].copy()
    if ev.empty:
        return {}
    stamps = stamps[valid]
    weights = weights[valid].astype(float)

    ages = stamps.map(lambda ts: max(0.0, (now - ts).total_seconds() / 86400.0))
    in_window = ages <= float(TRENDING_WINDOW_DAYS)
    if not bool(in_window.any()):
        # Window empty (e.g. stale seed) — degrade to full history.
        in_window = pd.Series(True, index=ev.index)
    import math

    decayed = weights[in_window] * ages[in_window].map(
        lambda a: math.exp(-a / RECENCY_TAU_DAYS)
    )
    return decayed.groupby(ev.loc[in_window, "item_id"]).sum().to_dict()


def trending(limit: int = 10, now: datetime | str | None = None) -> list[dict]:
    """Return the top-``limit`` trending available items, score-desc.

    ``score`` is the min-max normalised recency-decayed weight sum in
    [0, 1] (top item scores 1.0). ``reason`` is always ``"trending"``.
    Never returns an empty list while the catalog has available items.
    """
    ev = _load_interactions()
    latest: datetime
    if ev.empty:
        latest = datetime.now(timezone.utc)
    else:
        stamps = ev["timestamp"].map(_parse_ts).dropna()
        latest = (
            stamps.max()
            if not stamps.empty
            else datetime.now(timezone.utc)
        )
    ref = _as_now(now, latest)
    raw = _trending_raw(ref)
    avail_ids = _available_items()["item_id"].tolist()
    if not avail_ids:
        return []
    ceiling = max(raw.values(), default=0.0)
    rows = [
        {
            "item_id": item_id,
            "score": float(raw.get(item_id, 0.0) / ceiling) if ceiling > 0 else 0.0,
            "reason": "trending",
        }
        for item_id in avail_ids
    ]
    rows.sort(key=lambda r: (-r["score"], r["item_id"]))
    return rows[: max(0, int(limit))]


def _item_doc(row: pd.Series) -> str:
    """TF-IDF document for one catalog row: title + categories + brand."""
    title = str(row.get("title", "") or "")
    brand = str(row.get("brand_id", "") or "")
    cats = row.get("category_path", [])
    if isinstance(cats, (list, tuple)):
        cat_text = " ".join(str(c) for c in cats)
    elif cats is None or (isinstance(cats, float) and pd.isna(cats)):
        cat_text = ""
    else:
        cat_text = str(cats)
    return f"{title} {cat_text} {brand}".strip()


@lru_cache(maxsize=1)
def _tfidf_matrix() -> tuple[list[str], object, TfidfVectorizer]:
    """Fit TF-IDF over available items; return (item_ids, matrix, vectorizer)."""
    avail = _available_items()
    docs = [_item_doc(row) for _, row in avail.iterrows()]
    vectorizer = TfidfVectorizer()
    matrix = vectorizer.fit_transform(docs)
    return avail["item_id"].tolist(), matrix, vectorizer


def content_similar(item_id: str, k: int = 10) -> list[dict]:
    """Return the top-``k`` content neighbours of ``item_id`` (cosine, [0,1]).

    EXHAUSTIVE cosine scan over the TF-IDF matrix — no ANN (catalog < 2000).
    Unknown ``item_id`` (or ``k <= 0`` with no neighbours) falls back to
    :func:`trending` output so the list is never empty. ``reason`` is
    ``"content_similar"``, except on the unknown-item fallback path where
    trending rows keep reason ``"trending"`` (caller maps to the strategy).
    """
    item_ids, matrix, _ = _tfidf_matrix()
    if item_id not in item_ids or int(k) <= 0:
        return trending(max(int(k), 10) if int(k) <= 0 else int(k))
    idx = item_ids.index(item_id)
    sims = cosine_similarity(matrix[idx], matrix).flatten()
    ranked = sorted(
        ((float(sims[j]), item_ids[j]) for j in range(len(item_ids)) if j != idx),
        key=lambda t: (-t[0], t[1]),
    )
    return [
        {"item_id": iid, "score": float(score), "reason": "content_similar"}
        for score, iid in ranked[: int(k)]
    ]


def _category_sets() -> dict[str, set[str]]:
    """Map available item_id -> set of category tokens."""
    avail = _available_items()
    out: dict[str, set[str]] = {}
    for _, row in avail.iterrows():
        cats = row.get("category_path", [])
        if isinstance(cats, (list, tuple)):
            out[str(row["item_id"])] = {str(c) for c in cats}
        elif cats is None or (isinstance(cats, float) and pd.isna(cats)):
            out[str(row["item_id"])] = set()
        else:
            out[str(row["item_id"])] = {str(cats)}
    return out


def user_content_fallback(
    user_id: str, k: int = 10, now: datetime | str | None = None
) -> list[dict]:
    """Blend trending with category overlap for cold-start users.

    Intended for users with fewer than ``cold_start_threshold()``
    interactions; users at/above the threshold (or unknown users, or users
    with zero history) still get a valid list — pure trending when there is
    no seen-category signal. ``score = 0.7 * trending_norm + 0.3 * jaccard``
    stays in [0, 1]; overlap rows carry reason ``"content_similar"``.
    Never returns an empty list while the catalog has available items.
    """
    limit = max(int(k), 1)
    base = trending(limit=len(_available_items()), now=now)
    if not base:
        return []
    trend = {r["item_id"]: r["score"] for r in base}
    ev = _load_interactions()
    seen = (
        ev.loc[ev["user_id"] == str(user_id), "item_id"].astype(str).unique().tolist()
        if not ev.empty
        else []
    )
    _ = cold_start_threshold()  # documents the cold-start contract; blend is valid for any user
    if not seen:
        return base[:limit]
    catsets = _category_sets()
    seen_sets = [catsets.get(s, set()) for s in seen]
    seen_sets = [s for s in seen_sets if s]
    if not seen_sets:
        return base[:limit]
    rows: list[dict] = []
    for item_id, tscore in trend.items():
        cand = catsets.get(item_id, set())
        best = 0.0
        for s in seen_sets:
            union = cand | s
            if not union:
                continue
            best = max(best, len(cand & s) / len(union))
        score = CONTENT_BLEND_TRENDING * tscore + CONTENT_BLEND_OVERLAP * best
        rows.append(
            {
                "item_id": item_id,
                "score": float(score),
                "reason": "content_similar" if best > 0 else "trending",
            }
        )
    rows.sort(key=lambda r: (-r["score"], r["item_id"]))
    return rows[:limit]
