"""Canonical persisted interaction columns and empty first-run frame."""

from __future__ import annotations

import pandas as pd

INTERACTION_COLUMNS = [
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


def empty_interactions_frame() -> pd.DataFrame:
    """Return an empty frame with the exact consumer/training schema."""
    return pd.DataFrame(columns=INTERACTION_COLUMNS)


__all__ = ["INTERACTION_COLUMNS", "empty_interactions_frame"]
