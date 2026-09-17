"""Hybrid ranker with business rules + cold-start (todo 10).

Pure function ``rank(user_id, context="homepage", count=20, filter="",
model_version=None) -> dict`` returning::

    {recommendations: [{item_id, score, reason}], cold_start: bool,
     strategy: str, model_version: str}

Import path for todo 11 (stable)::

    from recommendation.app.ranker import rank

Candidate sources (union capped at ``CANDIDATE_CAP`` = 200):

- ``pop_top``: :func:`recommendation.app.baseline.trending` (``POP_N`` rows).
- ``als_top``: :func:`recommendation.app.train_als.recommend` (``ALS_N``
  rows), wrapped in try/except — a missing model file (or any load
  failure) degrades to the popularity+content path, never raises.
- ``content_top``: :func:`recommendation.app.baseline.content_similar`
  (``CONTENT_K`` rows) seeded by the user's most recent interacted item
  from the interactions parquet (max timestamp; ties broken by
  ``item_id`` asc); skipped when the user has no history.

Scoring: each source is max-normalised to [0, 1] (divide by the source
max; all-zero source stays 0.0 — idempotent for the already-normalised
trending/content scores, and maps the rank-based ALS scores into
[0, 1]), then combined as::

    final = ALS_W * als + CONTENT_W * content + POP_W * pop

with module constants ``ALS_W = 0.5``, ``CONTENT_W = 0.3``,
``POP_W = 0.2`` (tunable; cold-start/degraded paths reuse the same
constants with the ALS term at 0.0 — no renormalisation, so ordering
is comparable across paths). ``reason`` is the argmax weighted
component (``"als"`` / ``"content_similar"`` / ``"trending"``; ties
broken in that order). Sort is score desc with ``item_id`` asc as the
deterministic tie-break; no randomness anywhere.

Business rules (v1):

- available-only (from the items parquet);
- suppression: every item id the user ever interacted with (all event
  types, from the interactions parquet) is excluded;
- dedup (union is a dict keyed by item_id);
- diversity: at most 2 same-category-adjacent — walking the ranked
  list, an item is skipped when the previous 2 emitted items share its
  top-level category (first token of ``category_path``);
- NO price-band filter in v1 (the ``filter`` argument is accepted for
  API compatibility and ignored).

Cold-start: users with fewer than ``cold_start_threshold()``
interactions (imported from baseline) take the trending+content path
with ``cold_start=True``. Strategy choice on that path is
deterministic and documented here: ``"content"`` iff a content source
was present AND the final top-1 item's weighted content component
strictly exceeds its weighted popularity component; otherwise
``"trending"`` (in particular, zero-history users with no content
seed are always ``"trending"``).

``model_version`` is read ONLY from
``recommendation/models/current_version.txt`` (resolved relative to
this file, so any CWD works). A missing/unreadable/blank file forces
the degraded path: ``strategy="degraded"``, ``model_version="none"``,
popularity+content scoring only — never raises. The ``model_version``
argument is an optional label override (e.g. for staging callers); it
never changes which model artifacts are loaded (always the file
pointer). The output is validated by constructing
``schemas.RecResponse`` before returning its ``model_dump`` — proving
the wire shape; strategy values come ONLY from ``schemas.Strategy``.

Fallback contract: the response is NEVER empty while the catalog has
available items — exhausted candidates fall back to popular
(trending), first honouring suppression, then ignoring it if even
that is empty (a user who has seen the whole catalog still gets
recs).

No Kafka/Redis I/O inside ``rank()`` — parquet + model files only
(caching is todo 11's layer).
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from recommendation.app.baseline import (
    cold_start_threshold,
    content_similar,
    trending,
)
from recommendation.app.schemas import RecResponse, Strategy
from recommendation.app.train_als import recommend as _als_recommend

__all__ = [
    "ALS_W",
    "CONTENT_W",
    "POP_W",
    "CANDIDATE_CAP",
    "POP_N",
    "ALS_N",
    "CONTENT_K",
    "rank",
]

#: Blend weights for the hybrid score (tunable module constants).
ALS_W = 0.5
CONTENT_W = 0.3
POP_W = 0.2

#: Hard cap on the candidate union size.
CANDIDATE_CAP = 200

#: Per-source fetch sizes (union is capped at CANDIDATE_CAP anyway).
POP_N = 100
ALS_N = 100
CONTENT_K = 100

_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
_ITEMS_PARQUET = _DATA_DIR / "items.parquet"
_INTERACTIONS_PARQUET = _DATA_DIR / "interactions.parquet"
_MODELS_DIR = Path(__file__).resolve().parents[1] / "models"


def _load_items_df() -> pd.DataFrame:
    """Load the items catalog (module-global for test monkeypatching)."""
    return pd.read_parquet(_ITEMS_PARQUET)


def _load_interactions_df() -> pd.DataFrame:
    """Load the interactions log (module-global for test monkeypatching)."""
    return pd.read_parquet(_INTERACTIONS_PARQUET)


def _read_model_version() -> str | None:
    """Return the version pointer, or None when missing/unreadable/blank."""
    try:
        text = (_MODELS_DIR / "current_version.txt").read_text(encoding="utf-8")
    except OSError:
        return None
    text = text.strip()
    return text or None


def _maxnorm(scores: dict[str, float]) -> dict[str, float]:
    """Max-normalise a score dict into [0, 1] (zero-max stays 0.0)."""
    ceiling = max(scores.values(), default=0.0)
    if ceiling <= 0:
        return {k: 0.0 for k in scores}
    return {k: float(v) / float(ceiling) for k, v in scores.items()}


def _top_category(value: object) -> str:
    """Return the top-level category token for a catalog category_path cell."""
    if isinstance(value, (list, tuple)):
        parts = [str(c) for c in value]
    else:
        try:
            import numpy as np  # noqa: PLC0415 — local to keep import light

            if isinstance(value, np.ndarray):
                parts = [str(c) for c in value.tolist()]
            elif pd.isna(value):
                return ""
            else:
                parts = [str(value)]
        except (TypeError, ValueError):
            parts = [str(value)]
    return parts[0] if parts else ""


def _user_item_ids(ev: pd.DataFrame, user_id: str) -> list[str]:
    """All item ids a user ever interacted with (suppression set source)."""
    if ev.empty or "user_id" not in ev.columns:
        return []
    seen = ev.loc[ev["user_id"].astype(str) == str(user_id), "item_id"]
    return sorted({str(i) for i in seen.tolist()})


def _seed_item(ev: pd.DataFrame, user_id: str) -> str | None:
    """Most recent interacted item for ``user_id`` (None when no history).

    Max timestamp wins; ties broken by ``item_id`` asc for determinism.
    """
    if ev.empty:
        return None
    rows = ev[ev["user_id"].astype(str) == str(user_id)]
    if rows.empty:
        return None
    stamps = pd.to_datetime(rows["timestamp"], utc=True, errors="coerce")
    valid = rows[stamps.notna()]
    if valid.empty:
        return None
    stamps = stamps[stamps.notna()]
    latest = stamps.max()
    cands = valid.loc[stamps[stamps == latest].index, "item_id"].astype(str)
    return sorted(cands.unique().tolist())[0]


def _als_scores(user_id: str, n: int) -> dict[str, float]:
    """ALS top-``n`` as rank-decayed scores in (0, 1] (may raise)."""
    ids = _als_recommend(str(user_id), n=n)
    total = len(ids)
    if total == 0:
        return {}
    return {str(iid): float(total - rank) / float(total) for rank, iid in enumerate(ids)}


def _apply_diversity(
    ranked: list[str],
    category_of: dict[str, str],
    count: int,
) -> tuple[list[str], list[str]]:
    """Split ``ranked`` into (emitted, skipped) under the max-2-adjacent rule.

    Walking ``ranked`` in order, an item is skipped when the previous 2
    emitted items share its top-level category. Both outputs preserve
    input order; the caller decides how to use the skipped tail.
    """
    emitted: list[str] = []
    skipped: list[str] = []
    for item_id in ranked:
        if len(emitted) >= count:
            skipped.append(item_id)
            continue
        cat = category_of.get(item_id, "")
        if (
            len(emitted) >= 2
            and category_of.get(emitted[-1], "") == cat
            and category_of.get(emitted[-2], "") == cat
        ):
            skipped.append(item_id)
            continue
        emitted.append(item_id)
    return emitted, skipped


def rank(
    user_id: str,
    context: str = "homepage",
    count: int = 20,
    filter: str = "",  # noqa: A002 — spec-mandated argument name; ignored in v1
    model_version: str | None = None,
) -> dict:
    """Return hybrid recommendations for ``user_id`` (pure function).

    ``context`` and ``filter`` are accepted for API compatibility and
    ignored in v1 (no price-band filtering). See the module docstring
    for the scoring, strategy, and fallback contracts.
    """
    _ = context  # reserved for future context-aware blending
    _ = filter  # v1 has no price-band filter — intentionally ignored

    limit = max(int(count), 0)
    pointer = _read_model_version()
    label = model_version if model_version is not None else (pointer or "none")
    degraded_pointer = pointer is None and model_version is None

    items = _load_items_df()
    ev = _load_interactions_df()

    available = items[items["available"].astype(bool)].copy() if not items.empty else items
    avail_ids = (
        available["item_id"].astype(str).tolist() if not available.empty else []
    )
    if not avail_ids:
        resp = RecResponse(
            recommendations=[],
            cold_start=True,
            strategy=Strategy.degraded,
            model_version=label,
        )
        return resp.model_dump(mode="json")

    category_of = {
        str(row["item_id"]): _top_category(row.get("category_path"))
        for _, row in available.iterrows()
    }
    avail_set = set(avail_ids)
    suppressed = set(_user_item_ids(ev, str(user_id)))
    n_interactions = (
        int((ev["user_id"].astype(str) == str(user_id)).sum())
        if not ev.empty and "user_id" in ev.columns
        else 0
    )
    cold = bool(n_interactions < cold_start_threshold())

    # --- candidate sources (parquet + model files only) ---
    pop_rows = trending(limit=POP_N)
    pop_scores = _maxnorm({r["item_id"]: float(r["score"]) for r in pop_rows})

    seed = _seed_item(ev, str(user_id))
    content_scores: dict[str, float] = {}
    if seed is not None:
        try:
            content_rows = content_similar(seed, k=CONTENT_K)
        except Exception:
            content_rows = []
        content_scores = _maxnorm(
            {
                r["item_id"]: float(r["score"])
                for r in content_rows
                if r.get("reason") == "content_similar"
            }
        )

    strategy: Strategy
    als_scores: dict[str, float] = {}
    if degraded_pointer:
        strategy = Strategy.degraded
    elif cold:
        strategy = Strategy.trending  # refined to content below if dominated
    else:
        try:
            als_scores = _maxnorm(_als_scores(str(user_id), ALS_N))
            strategy = Strategy.als_hybrid
        except Exception:
            als_scores = {}
            strategy = Strategy.degraded

    # --- union (deduped, available-only, capped) ---
    union = [i for i in sorted(set(pop_scores) | set(als_scores) | set(content_scores)) if i in avail_set]
    union = [i for i in union if i not in suppressed][:CANDIDATE_CAP]

    scored: list[tuple[float, str]] = []
    comp: dict[str, tuple[float, float, float]] = {}
    for item_id in union:
        a = als_scores.get(item_id, 0.0)
        c = content_scores.get(item_id, 0.0)
        p = pop_scores.get(item_id, 0.0)
        comp[item_id] = (a, c, p)
        scored.append((ALS_W * a + CONTENT_W * c + POP_W * p, item_id))
    scored.sort(key=lambda t: (-t[0], t[1]))
    ordered = [item_id for _, item_id in scored]

    emitted, skipped = _apply_diversity(ordered, category_of, limit)
    # Top-up pass: skipped items (diversity overflow) get a second chance
    # in order so responses stay deep; the adjacency rule still applies.
    if len(emitted) < limit:
        for item_id in skipped:
            if len(emitted) >= limit:
                break
            cat = category_of.get(item_id, "")
            if (
                len(emitted) >= 2
                and category_of.get(emitted[-1], "") == cat
                and category_of.get(emitted[-2], "") == cat
            ):
                continue
            emitted.append(item_id)

    # --- fallback: never empty while the catalog has available items ---
    if not emitted and limit > 0:
        for row in pop_rows:
            if row["item_id"] in avail_set and row["item_id"] not in suppressed:
                emitted = [row["item_id"]]
                break
        if not emitted:
            for row in pop_rows:
                if row["item_id"] in avail_set:
                    emitted = [row["item_id"]]
                    break
        if not emitted:
            emitted = [sorted(avail_set)[0]]
    emitted = emitted[:limit]

    if strategy is Strategy.trending and content_scores and emitted:
        top = emitted[0]
        a, c, p = comp.get(top, (0.0, 0.0, 0.0))
        if c > 0 and CONTENT_W * c > POP_W * p:
            strategy = Strategy.content

    recommendations = []
    for item_id in emitted:
        a, c, p = comp.get(item_id, (0.0, 0.0, 0.0))
        parts = (("als", ALS_W * a), ("content_similar", CONTENT_W * c), ("trending", POP_W * p))
        reason = max(parts, key=lambda t: t[1])[0]
        if max(a, c, p) == 0.0:
            reason = "trending"  # fallback-populated rows carry no source signal
            final = pop_scores.get(item_id, 0.0) * POP_W
        else:
            final = ALS_W * a + CONTENT_W * c + POP_W * p
        recommendations.append(
            {"item_id": item_id, "score": float(final), "reason": reason}
        )

    resp = RecResponse(
        recommendations=recommendations,  # type: ignore[arg-type]
        cold_start=cold,
        strategy=strategy,
        model_version=label,
    )
    return resp.model_dump(mode="json")
