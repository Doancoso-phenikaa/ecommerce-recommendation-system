"""Pydantic v2 contracts for the recommendation service.

Event/user/item ingestion models plus recommendation response envelopes.

Contract references:

- Alibaba one-product-per-cart rule (each cart/purchase event references
  exactly one product):
  https://www.alibabacloud.com/help/en/airec/what-is-pai-rec/user-guide/e-commerce-recommend-scene
- Google Retail ``UserEvent`` (typed interactions, revenue fields):
  https://docs.cloud.google.com/retail/docs/user-events
- Recombee typed interactions: https://docs.recombee.com/api

``model_version`` single source of truth: the file
``recommendation/models/current_version.txt`` (owned by todo 16 — it is only
*referenced* here, never created or read at import time, so importing this
module never fails when the file is absent).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


def uuid4_hex() -> str:
    """Return a random UUID4 as a 32-character lowercase hex string."""
    return uuid.uuid4().hex


MODEL_VERSION_FILE = "recommendation/models/current_version.txt"
"""Canonical source of ``model_version`` (owned by todo 16; referenced only)."""


class EventType(str, Enum):
    """Closed set of accepted interaction event types (exactly 8 members)."""

    view = "view"
    click = "click"
    cart = "cart"
    purchase = "purchase"
    wishlist = "wishlist"
    rating = "rating"
    impression = "impression"
    search = "search"


class Strategy(str, Enum):
    """Serving strategy used to produce a recommendation response."""

    als_hybrid = "als_hybrid"
    trending = "trending"
    content = "content"
    degraded = "degraded"


class EventValue(BaseModel):
    """Optional per-event payload (revenue / rating / search details)."""

    rating: float | None = None
    quantity: int | None = None
    unit_price_cents: int | None = None
    currency: str | None = None
    query: str | None = None


class EventIn(BaseModel):
    """Single interaction event (exactly one product per event)."""

    request_id: str = Field(default_factory=uuid4_hex)
    user_id: str
    item_id: str
    event_type: EventType
    timestamp: datetime
    session_id: str | None = None
    context: dict[str, Any] | None = None
    value: EventValue | None = None

    @field_validator("item_id", mode="before")
    @classmethod
    def _reject_item_lists(cls, v: Any) -> Any:
        """Reject list-like ``item_id`` values with a clear message.

        Cart/purchase (and every other) events reference exactly one
        product via a scalar ``item_id``; item lists are never valid here.
        """
        if isinstance(v, (list, tuple, set, frozenset, dict)):
            raise ValueError(
                "cart/purchase events must contain exactly one product: "
                "'item_id' must be a single product id string, "
                f"got {type(v).__name__} {v!r}"
            )
        return v

    @model_validator(mode="after")
    def _check_single_product_and_revenue(self) -> EventIn:
        """Enforce one-product-per-cart/purchase and purchase revenue."""
        if self.event_type in (EventType.cart, EventType.purchase):
            if not isinstance(self.item_id, str):
                raise ValueError(
                    f"{self.event_type.value} events must contain exactly "
                    f"one product: 'item_id' must be a single product id "
                    f"string, got {self.item_id!r}"
                )
            if isinstance(self.context, dict):
                for key in ("items", "item_ids"):
                    nested = self.context.get(key)
                    if isinstance(nested, (list, tuple)):
                        raise ValueError(
                            f"{self.event_type.value} events must contain "
                            f"exactly one product: '{key}' item lists are "
                            "not allowed (one product per event)"
                        )
        if self.event_type == EventType.purchase:
            value = self.value
            if (
                value is None
                or value.unit_price_cents is None
                or value.quantity is None
            ):
                raise ValueError(
                    "purchase events require revenue: "
                    "'value.unit_price_cents' and 'value.quantity' "
                    "must both be set"
                )
            if not value.currency:
                raise ValueError(
                    "purchase events require 'value.currency' "
                    "to be set"
                )
        return self


class UserIn(BaseModel):
    """User profile attributes for ingestion/personalization."""

    user_id: str
    gender: str | None = None
    age_group: str | None = None
    country: str | None = None


class ItemIn(BaseModel):
    """Catalog item attributes."""

    item_id: str
    title: str
    brand_id: str | None = None
    category_path: list[str] | None = None
    price_cents: int
    image_url: str | None = None
    available: bool = True

    @field_validator("category_path", mode="before")
    @classmethod
    def _coerce_category_path(cls, v: Any) -> Any:
        """Accept a single category string as a one-element path."""
        if v is None or isinstance(v, list):
            return v
        if isinstance(v, str):
            return [v]
        return v


class ScoredItem(BaseModel):
    """Single scored recommendation entry."""

    item_id: str
    score: float
    reason: str | None = None


class RecItem(ScoredItem):
    """Scored entry inside :class:`RecResponse`."""


class SimilarItem(ScoredItem):
    """Scored entry inside :class:`SimilarResponse`."""


class RecResponse(BaseModel):
    """Personalized recommendation response envelope."""

    recommendations: list[ScoredItem]
    cold_start: bool
    strategy: Strategy
    model_version: str


class SimilarResponse(BaseModel):
    """Similar-items response envelope (intentionally no ``cold_start``)."""

    items: list[ScoredItem]
    model_version: str
    strategy: Strategy


__all__ = [
    "uuid4_hex",
    "MODEL_VERSION_FILE",
    "EventType",
    "Strategy",
    "EventValue",
    "EventIn",
    "UserIn",
    "ItemIn",
    "ScoredItem",
    "RecItem",
    "SimilarItem",
    "RecResponse",
    "SimilarResponse",
]
