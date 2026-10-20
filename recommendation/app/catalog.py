"""Atomic full-snapshot catalog ingestion for the recommendation service."""

from __future__ import annotations

import os
import logging
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from recommendation.app import baseline, ranker, store
from recommendation.app.schemas import CatalogSyncRequest, CatalogSyncResponse

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
ITEMS_PARQUET = DATA_DIR / "items.parquet"
CATALOG_COLUMNS = [
    "item_id",
    "title",
    "brand_id",
    "category_path",
    "price_cents",
    "image_url",
    "available",
]

_SYNC_LOCK = threading.Lock()
logger = logging.getLogger(__name__)


def _write_parquet(frame: pd.DataFrame, path: Path) -> None:
    """Write one candidate snapshot. Kept separate for failure-path tests."""
    frame.to_parquet(path, index=False)


def _validate_written_snapshot(path: Path, expected_rows: int) -> None:
    frame = pd.read_parquet(path)
    missing = [column for column in CATALOG_COLUMNS if column not in frame.columns]
    if missing:
        raise ValueError(f"written catalog is missing columns: {missing}")
    if len(frame) != expected_rows:
        raise ValueError(
            f"written catalog row count mismatch: expected {expected_rows}, got {len(frame)}"
        )
    if frame["item_id"].astype(str).duplicated().any():
        raise ValueError("written catalog contains duplicate item_id values")


def _invalidate_local_caches() -> None:
    baseline._load_items.cache_clear()
    baseline._tfidf_matrix.cache_clear()
    ranker.invalidate_frame_cache()


def replace_catalog(request: CatalogSyncRequest) -> CatalogSyncResponse:
    """Persist a validated full snapshot and invalidate catalog-derived caches.

    The temporary file is created beside ``items.parquet`` so ``os.replace``
    remains an atomic same-filesystem operation. The previous catalog is never
    touched until the candidate Parquet has been written and read back.
    """
    rows = [item.model_dump(mode="python") for item in request.items]
    frame = pd.DataFrame(rows, columns=CATALOG_COLUMNS)
    frame["item_id"] = frame["item_id"].astype(str)
    frame["price_cents"] = frame["price_cents"].astype("int64")
    frame["available"] = frame["available"].astype(bool)

    target = ITEMS_PARQUET
    target.parent.mkdir(parents=True, exist_ok=True)

    with _SYNC_LOCK:
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=".items-", suffix=".parquet.tmp", dir=target.parent
        )
        os.close(descriptor)
        temporary = Path(temporary_name)
        try:
            _write_parquet(frame, temporary)
            _validate_written_snapshot(temporary, len(frame))
            os.replace(temporary, target)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise

        _invalidate_local_caches()

    # Redis is an optional serving dependency. Clear every result whose
    # contents depend on catalog membership; a down Redis cannot invalidate
    # the already-committed on-disk snapshot.
    try:
        store.invalidate_catalog_caches()
    except store.CacheUnavailable as exc:
        logger.warning("Catalog committed while Redis was unavailable: %s", exc)

    return CatalogSyncResponse(
        total_items=len(frame),
        available_items=int(frame["available"].sum()),
        synced_at=datetime.now(timezone.utc),
    )


__all__ = [
    "CATALOG_COLUMNS",
    "ITEMS_PARQUET",
    "replace_catalog",
]
