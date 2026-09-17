"""Seed-data generator for the recommendation service.

AFFINITY MECHANISM (why the ALS-vs-popularity +0.02 gate in todo 12 is attainable)
----------------------------------------------------------------------------------
Uniform-random events carry no recoverable latent structure: every user would
interact with every category at the same rate, so a personalized model (ALS)
cannot beat a global popularity baseline. To embed structure this generator:

1. Assigns each user 1-2 AFFINITY CATEGORIES (sampled deterministically with
   ``random.Random(SEED)``; stored as the ``affinity_categories`` extra field
   on each record in ``seed_users.json`` — ``UserIn`` ignores extra fields, so
   validation still passes — which also lets ``--verify-affinity`` recompute
   the statistic from the seed files alone, without re-running generation).
2. Samples AFFINITY_PROB = 70% of that user's events from items in their
   affinity categories (uniform within those categories), and the remaining
   30% uniformly from the full catalog (exploration noise).
3. Keeps the split per event-type mix (view/click/cart/purchase) so the
   structure is visible across all interaction types, including purchases
   (which carry revenue fields required by ``EventIn``).

Result: each user's interaction history concentrates on their affinity
categories (~70% + random-baseline spillover, expect ~72-80% overall), i.e. a
user x category latent block structure that implicit ALS recovers while a
global popularity ranker cannot — which is exactly what the todo-12 gate
(ALS beats popularity by +0.02) needs.

Usage (repo-root CWD; imports ``recommendation.app.*``)::
    python recommendation/scripts/seed.py                # generate + validate + parquet
    python recommendation/scripts/seed.py --verify-affinity  # also print affinity report
    python recommendation/scripts/seed.py --check-only    # validate existing seeds + rebuild parquet (no regeneration)

``--check-only`` is what proves the corrupt-line failure case: append a bad
JSON line to ``seed_events.jsonl`` and the run exits non-zero naming the line
number; restore the file and it exits 0 again.

Outputs (all under ``recommendation/data/``; ``*.parquet`` are gitignored
build artifacts, generators stay rerunnable — never commit outputs):
    seed_users.json, seed_items.json, seed_events.jsonl (generators' sources)
    interactions.parquet, items.parquet (validated build artifacts)
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Repo-root CWD contract: `python recommendation/scripts/seed.py` run from the
# repo root must resolve `import recommendation.app.*`. Python puts the
# *script's* dir (recommendation/scripts/) on sys.path, not the CWD, so insert
# the repo root explicitly (same trick as tests/conftest.py).
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd
from pydantic import ValidationError

from recommendation.app.schemas import EventIn, ItemIn, UserIn

SEED = 42
N_USERS = 24
N_EVENTS = 600
AFFINITY_PROB = 0.70  # P(event item drawn from the user's affinity categories)

CATEGORIES = ["electronics", "books", "clothing", "home", "sports", "toys"]
ITEMS_PER_CATEGORY = 12  # 6 x 12 = 72 items (>= 60, >= 5 categories)

BRANDS = {
    "electronics": ["VoltCore", "CircuitPro"],
    "books": ["Inkwell", "FolioPress"],
    "clothing": ["Threadline", "UrbanWeave"],
    "home": ["HearthNest", "OakHaven"],
    "sports": ["PeakForm", "TrailBlaze"],
    "toys": ["PlayBright", "KidCraft"],
}

EVENT_MIX: tuple[tuple[str, float], ...] = (
    ("view", 0.50),
    ("click", 0.25),
    ("cart", 0.15),
    ("purchase", 0.10),
)

GENDERS = ["male", "female", "other"]
AGE_GROUPS = ["18-24", "25-34", "35-44", "45+"]
COUNTRIES = ["US", "GB", "DE", "IN", "BR"]

ROOT = Path(__file__).resolve().parents[2]  # repo root (script lives in recommendation/scripts/)
DATA_DIR = ROOT / "recommendation" / "data"
USERS_FILE = DATA_DIR / "seed_users.json"
ITEMS_FILE = DATA_DIR / "seed_items.json"
EVENTS_FILE = DATA_DIR / "seed_events.jsonl"
INTERACTIONS_PARQUET = DATA_DIR / "interactions.parquet"
ITEMS_PARQUET = DATA_DIR / "items.parquet"


def _event_type(rng: random.Random) -> str:
    r = rng.random()
    cumulative = 0.0
    for name, weight in EVENT_MIX:
        cumulative += weight
        if r < cumulative:
            return name
    return EVENT_MIX[-1][0]


def generate(rng: random.Random, n_events: int = N_EVENTS) -> tuple[list[dict], list[dict], list[dict]]:
    """Generate (users, items, events) dicts with embedded affinity structure."""
    items: list[dict] = []
    items_by_category: dict[str, list[dict]] = {c: [] for c in CATEGORIES}
    for category in CATEGORIES:
        for i in range(ITEMS_PER_CATEGORY):
            brand = BRANDS[category][i % len(BRANDS[category])]
            item = {
                "item_id": f"{category[:3]}-{i + 1:03d}",
                "title": f"{brand} {category.title()} Product {i + 1}",
                "brand_id": brand,
                "category_path": [category],
                "price_cents": rng.randint(499, 99999),
                "image_url": f"https://example.com/img/{category}-{i + 1:03d}.jpg",
                "available": rng.random() < 0.9,
            }
            items.append(item)
            items_by_category[category].append(item)

    users: list[dict] = []
    for u in range(1, N_USERS + 1):
        n_affinity = rng.choice([1, 2])
        affinity = rng.sample(CATEGORIES, n_affinity)
        users.append(
            {
                "user_id": f"user-{u:03d}",
                "gender": rng.choice(GENDERS),
                "age_group": rng.choice(AGE_GROUPS),
                "country": rng.choice(COUNTRIES),
                "affinity_categories": affinity,  # extra field: ignored by UserIn, used by --verify-affinity
            }
        )

    now = datetime.now(timezone.utc)
    request_ids: set[str] = set()
    events: list[dict] = []
    for _ in range(n_events):
        user = rng.choice(users)
        # 70% from affinity categories, 30% uniform exploration noise.
        if rng.random() < AFFINITY_PROB:
            pool = [it for c in user["affinity_categories"] for it in items_by_category[c]]
        else:
            pool = items
        item = rng.choice(pool)
        event_type = _event_type(rng)
        request_id = uuid.uuid4().hex
        assert request_id not in request_ids  # uniqueness: consumer dedups on request_id (todo 6)
        request_ids.add(request_id)
        event: dict = {
            "request_id": request_id,
            "user_id": user["user_id"],
            "item_id": item["item_id"],
            "event_type": event_type,
            "timestamp": (now - timedelta(seconds=rng.randint(0, 30 * 24 * 3600))).isoformat(),
            "session_id": f"sess-{user['user_id']}-{rng.randint(1, 3):02d}",
            "context": {"source": "seed"},
        }
        if event_type == "purchase":
            event["value"] = {
                "quantity": rng.randint(1, 3),
                "unit_price_cents": item["price_cents"],
                "currency": "USD",
            }
        elif event_type == "cart":
            event["value"] = {"quantity": 1}
        events.append(event)

    events.sort(key=lambda e: e["timestamp"])
    return users, items, events


def fail(msg: str) -> int:
    print(f"ERROR {msg}", file=sys.stderr)
    return 1


def validate_and_build() -> int:
    """Validate every seed record against schemas; build parquet artifacts."""
    try:
        raw_users = json.loads(USERS_FILE.read_text())
        raw_items = json.loads(ITEMS_FILE.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        return fail(f"{exc}")

    users = []
    for i, record in enumerate(raw_users, start=1):
        try:
            users.append(UserIn.model_validate(record))
        except ValidationError as exc:
            return fail(f"{USERS_FILE.name}:{i}: {exc.errors()[0]['msg']}")

    items = []
    for i, record in enumerate(raw_items, start=1):
        try:
            items.append(ItemIn.model_validate(record))
        except ValidationError as exc:
            return fail(f"{ITEMS_FILE.name}:{i}: {exc.errors()[0]['msg']}")

    request_ids: set[str] = set()
    event_rows: list[dict] = []
    with EVENTS_FILE.open() as fh:
        for lineno, line in enumerate(fh, start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                return fail(f"{EVENTS_FILE.name}:{lineno}: invalid JSON ({exc.msg})")
            try:
                event = EventIn.model_validate(record)
            except ValidationError as exc:
                return fail(f"{EVENTS_FILE.name}:{lineno}: {exc.errors()[0]['msg']}")
            if event.request_id in request_ids:
                return fail(f"{EVENTS_FILE.name}:{lineno}: duplicate request_id {event.request_id}")
            request_ids.add(event.request_id)
            value = event.value
            event_rows.append(
                {
                    "request_id": event.request_id,
                    "user_id": event.user_id,
                    "item_id": event.item_id,
                    "event_type": event.event_type.value,
                    "timestamp": event.timestamp.isoformat(),
                    "session_id": event.session_id,
                    "quantity": value.quantity if value else None,
                    "unit_price_cents": value.unit_price_cents if value else None,
                    "currency": value.currency if value else None,
                }
            )

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(event_rows).to_parquet(INTERACTIONS_PARQUET, index=False)
    pd.DataFrame([it.model_dump() for it in items]).to_parquet(ITEMS_PARQUET, index=False)

    print(f"users: {len(users)} ({USERS_FILE.name})")
    print(f"items: {len(items)} ({ITEMS_FILE.name})")
    print(f"events: {len(event_rows)} ({EVENTS_FILE.name})")
    print(f"wrote {INTERACTIONS_PARQUET} ({len(event_rows)} rows)")
    print(f"wrote {ITEMS_PARQUET} ({len(items)} rows)")
    return 0


def verify_affinity() -> int:
    """Print % of events whose item category is in the user's affinity set."""
    affinity = {u["user_id"]: set(u.get("affinity_categories", [])) for u in json.loads(USERS_FILE.read_text())}
    category = {}
    for it in json.loads(ITEMS_FILE.read_text()):
        path = it.get("category_path") or []
        category[it["item_id"]] = path[0] if path else None
    total = hits = 0
    with EVENTS_FILE.open() as fh:
        for line in fh:
            if not line.strip():
                continue
            record = json.loads(line)
            total += 1
            if category.get(record["item_id"]) in affinity.get(record["user_id"], set()):
                hits += 1
    pct = 100.0 * hits / total if total else 0.0
    print(f"affinity: {hits}/{total} events in user affinity categories ({pct:.1f}%, target ~70%+)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate + validate recommendation seed data.")
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--n-events", type=int, default=N_EVENTS)
    parser.add_argument("--check-only", action="store_true", help="validate existing seeds + rebuild parquet")
    parser.add_argument("--verify-affinity", action="store_true", help="print affinity-structure report")
    args = parser.parse_args(argv)

    if not args.check_only:
        rng = random.Random(args.seed)
        users, items, events = generate(rng, args.n_events)
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        USERS_FILE.write_text(json.dumps(users, indent=2) + "\n")
        ITEMS_FILE.write_text(json.dumps(items, indent=2) + "\n")
        with EVENTS_FILE.open("w") as fh:
            for event in events:
                fh.write(json.dumps(event) + "\n")

    rc = validate_and_build()
    if rc != 0:
        return rc
    print(f"affinity mechanism: {AFFINITY_PROB:.0%} of events sampled from each user's 1-2 affinity categories")
    if args.verify_affinity:
        return verify_affinity()
    return 0


if __name__ == "__main__":
    sys.exit(main())
