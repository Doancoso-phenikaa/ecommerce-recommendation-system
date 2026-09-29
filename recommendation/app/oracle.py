"""Category-oracle baseline for the offline eval gate.

Answers: how well could a model do if it learned *only* which
top-level category a user likes, with no per-item signal at all?

For one test user, collect the top-level categories of the items they
touched in the TRAIN SLICE ONLY, then emit the most train-popular
available item from each of those categories, ordered by descending
train popularity, until ``k`` items. Ties break on ``item_id`` so the
result is deterministic.

This is a deliberately strong comparator: it encodes exactly the
category block structure ``scripts/seed.py`` plants. A hybrid that
cannot beat it has learned nothing beyond the seed generator.
"""

from __future__ import annotations

import pandas as pd

__all__ = ["category_oracle_topk"]


def _top_category(value: object) -> str:
    """Return the top-level category token of a ``category_path`` cell."""
    if isinstance(value, (list, tuple)):
        parts = [str(c) for c in value]
    elif value is None:
        return ""
    else:
        try:
            if pd.isna(value):
                return ""
        except (TypeError, ValueError):
            pass
        parts = [str(value)]
    return parts[0] if parts else ""


def category_oracle_topk(
    train_df: pd.DataFrame,
    items_df: pd.DataFrame,
    user_id: str,
    k: int = 10,
) -> list[str]:
    """Return up to ``k`` item ids: the user's categories' train-popular head.

    Falls back to global train popularity (descending) when the user has
    no in-catalog train item, so the oracle is never empty while the
    catalog holds available items and never raises.
    """
    k = max(int(k), 0)
    if k == 0 or items_df is None or items_df.empty:
        return []

    available = items_df[items_df["available"].astype(bool)]
    available_ids = [str(i) for i in available["item_id"].tolist()]
    if not available_ids:
        return []
    category_of = {
        str(row["item_id"]): _top_category(row.get("category_path"))
        for _, row in available.iterrows()
    }

    if train_df is None or train_df.empty or "user_id" not in train_df.columns:
        return available_ids[:k]

    counts = train_df["item_id"].astype(str).value_counts().to_dict()
    own = train_df.loc[
        train_df["user_id"].astype(str) == str(user_id), "item_id"
    ].astype(str)
    own_ids = set(own.tolist())
    wanted = {category_of.get(iid, "") for iid in own_ids}
    wanted.discard("")

    # Exclude the user's own train items: relevance is novel-holdout-only,
    # so recommending them can never be a hit and would only waste slots.
    available_ids = [iid for iid in available_ids if iid not in own_ids]

    ranked = sorted(
        ((iid, int(counts.get(iid, 0))) for iid in available_ids),
        key=lambda t: (-t[1], t[0]),
    )
    if not wanted:
        return [iid for iid, _ in ranked[:k]]

    pool = [t for t in ranked if category_of.get(t[0], "") in wanted]
    if not pool:
        return [iid for iid, _ in ranked[:k]]
    return [iid for iid, _ in pool[:k]]
