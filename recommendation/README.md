# Recommendation Service

Personalized product recommendations for the storefront: a FastAPI serving
layer over an implicit-ALS hybrid ranker, fed by a Kafka event pipeline and
refreshed by a nightly retrain gate. All commands below run from the **repo
root**. Python: `recommendation/.venv/bin/python` (venv) with `PYTHONPATH=.`.

> **Integrating the NestJS backend?** Read
> [`docs/BACKEND-CONTRACT.md`](docs/BACKEND-CONTRACT.md) first — the backend
> on `develop` and this service on `recommandation` currently disagree on
> method, path, request shape, response shape, and item-id format, and the
> branches have never been merged.

## Setup

```bash
# Python 3.11 is required: the `implicit`/`pandas`/`pyarrow` pins have no
# 3.14 wheels, and 3.12+ changed Enum.__contains__ semantics the trainer
# depends on.
uv venv --python 3.11 recommendation/.venv
uv pip install --python recommendation/.venv/bin/python -r recommendation/requirements.txt
PYTHONPATH=. recommendation/.venv/bin/python recommendation/scripts/seed.py
```

## Architecture

```
storefront ── POST /events ──────────────────────────────┐
                                                         v
storefront ── GET /recommendations/{user} ──> FastAPI ──> retrieval / rank
                   GET /similar/{item}            |  |         |  |
                       GET /health                |  |         |  +--> ALS model files
                       GET /metrics               |  |         |       (models/als_<ver>/ + current_version.txt)
                                                  |  |         +--> Parquet (data/items, data/interactions)
                                                  |  +--> Redis cache (recs:* / similar:* / popular:*)
                                                  |
events ──> Kafka topic user-events ──> consumer ──> Parquet + Redis
   (broker down: spool to data/local_buffer.jsonl, still HTTP 202)   |
   (malformed: topic user-events-dlq)                                 |
                                                                      v
                        nightly retrain loop: drain -> train -> eval gate
                        (PASS: pointer + invalidate popular:* |
                         FAIL exit 3: keep pointer + ALERT to retrain.log)
```

Serving request flow: `recs:{user}:{context}:{filter}:{model_version}` cache
lookup (`X-Cache: HIT`) → miss → `ranker.rank` (ALS + trending + content,
business rules) → best-effort `cache_set` (`X-Cache: MISS`). Boot and every
route degrade when Kafka/Redis are down: buffered / uncached / degraded —
never a 500 for a valid request.

## Quickstart (repo root)

Steps marked `[docker]` need a running Docker daemon (documented here, not
re-verified in daemon-less environments — the API steps below them were
proven live without Docker).

```bash
# [docker] Kafka + Redis
docker compose -f recommendation/docker-compose.yml up -d
# [docker] create topics user-events (3 partitions) + user-events-dlq (1 partition)
bash recommendation/scripts/bootstrap_topics.sh

# seed catalog + interactions -> recommendation/data/{interactions,items}.parquet
PYTHONPATH=. recommendation/.venv/bin/python recommendation/scripts/seed.py
# train ALS v1 -> recommendation/models/als_v1/ + current_version.txt pointer
PYTHONPATH=. recommendation/.venv/bin/python recommendation/scripts/train.py --version v1
# offline eval gate: exit 0 PASS (NDCG_hybrid > NDCG_baseline + 0.02), exit 3 FAIL
PYTHONPATH=. recommendation/.venv/bin/python recommendation/scripts/evaluate.py --version v1
# serve (port 8000 dev default; 8001 is verification-only)
REDIS_URL=redis://localhost:6379/0 \
MODEL_DIR=$PWD/recommendation/models \
PYTHONPATH=. recommendation/.venv/bin/uvicorn recommendation.app.main:app --port 8001
```

`REDIS_URL` and `MODEL_DIR` are **required** (`config.ConfigError` → 500
without them). A dead Redis URL is fine: routes serve uncached. Kafka needs
no env (default `localhost:9092`); when down, `POST /events` still returns
202 with `status: "queued-buffered"`.

## Endpoints (all verified live on localhost:8001, `curl -s ... | jq -e`)

### `GET /health` — dependency states + model pointer

```bash
curl -s http://localhost:8001/health | jq -e .
```

```json
{ "status": "degraded", "kafka": "down", "redis": "down", "model_version": "v1" }
```

`status` is `"ok"` only when kafka + redis are up **and** the pointer file
exists; otherwise `"degraded"` (never 500).

### `GET /recommendations/{user_id}?count=20&context=homepage` — personalized recs

```bash
curl -s "http://localhost:8001/recommendations/user-001?count=5" | \
  jq -e '{n: (.recommendations|length), cold_start, strategy, model_version}'
# { "n": 5, "cold_start": false, "strategy": "als_hybrid", "model_version": "v1" }
```

Full shape (real response, `X-Cache: MISS` header on first hit):

```json
{
  "recommendations": [
    {"item_id": "boo-009", "score": 0.8363, "reason": "als"},
    {"item_id": "boo-008", "score": 0.5868, "reason": "als"}
  ],
  "cold_start": false,
  "strategy": "als_hybrid",
  "model_version": "v1"
}
```

Unknown users never 404 — they fall back inside the ranker (cold-start
ladder below). Hostile ids (`:` / SCAN glob chars) → 422.

### `GET /similar/{item_id}?count=10` — content neighbours (no `cold_start` field)

```bash
curl -s "http://localhost:8001/similar/ele-001?count=3" | \
  jq -e '{n: (.items|length), strategy, model_version}'
# { "n": 3, "strategy": "content", "model_version": "v1" }
```

Cache key `similar:{item}` carries no model version (content neighbours are
deterministic on the catalog).

### `POST /events` — ingest one interaction (202, never 500 when Kafka is down)

```bash
curl -s -X POST http://localhost:8001/events \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"user-001","item_id":"ele-001","event_type":"view",
       "timestamp":"2026-09-17T00:00:00Z"}' | jq -e .
# Kafka up:   { "status": "queued",          "request_id": "<uuid4hex>" }
# Kafka down: { "status": "queued-buffered", "request_id": "<uuid4hex>" }
```

Invalid bodies → 422 (e.g. missing `item_id`, item lists, purchase without
revenue — verified: `curl -s -o /dev/null -w "%{http_code}\n" ...` → `422`).

### `GET /metrics` — Prometheus exposition

`recsys_request_latency_seconds{route}`,
`recs_served_total{strategy,cold_start}`, `bus_publish_failures` gauge.
`RECSYS_METRICS=off` → 503 on `/metrics` only. Live scrape after the calls
above showed e.g. `recs_served_total{cold_start="false",strategy="als_hybrid"}
2.0` and `bus_publish_failures 1.0`.

## Event schema (`EventIn` — exactly one product per event)

| Field        | Type      | Required | Notes                                                        |
|--------------|-----------|----------|--------------------------------------------------------------|
| `request_id` | string    | no       | auto `uuid4_hex` when absent; consumer dedups on it          |
| `user_id`    | string    | yes      |                                                              |
| `item_id`    | string    | yes      | scalar only — lists rejected (one product per cart/purchase) |
| `event_type` | enum (8)  | yes      | view/click/cart/purchase/wishlist/rating/impression/search   |
| `timestamp`  | datetime  | yes      |                                                              |
| `session_id` | string    | no       |                                                              |
| `context`    | object    | no       | `items`/`item_ids` lists rejected on cart/purchase           |
| `value`      | object    | no*      | *purchase requires `unit_price_cents` + `quantity` + `currency` |

`value` also carries `rating` (weight = clamped rating, see below) and
`query` (search).

## EVENT_WEIGHTS (single source: `app/bus.py`, reused by ALS + trending)

| event_type | weight | note                              |
|------------|--------|-----------------------------------|
| purchase   | 5      | highest intent                    |
| wishlist   | 3      |                                   |
| rating     | 3      | default; live weight = `value.rating` clamped to [1, 5] |
| cart       | 2      |                                   |
| click      | 1      |                                   |
| view       | 1      |                                   |
| search     | 0.3    |                                   |
| impression | 0.2    | weakest signal                    |

Trending multiplies these by recency decay `exp(-age_days / 14)` over a
trailing 30-day window, min-max normalised to [0, 1].

## Cache TTLs (`app/store.py` — envelope `{"data", "generatedAt"}`)

| Key pattern | Content                  | TTL (s)          |
|-------------|--------------------------|------------------|
| `recs:{user}:{context}:{filter}:{model_version}:{count}` | personalized recs | 120 default, clamped to [60, 300] |
| `similar:{item}:{count}` | content neighbours    | 21600 (6 h)      |
| `popular:{page}` | global trending page  | 300              |
| `session:{id}`   | per-session hash      | 1800 (30 min)    |

`count` is part of both personalized keys: it changes the payload, so a
cached 5-item list must never satisfy a caller who asked for 50. Every
segment is validated — `:` is rejected in `context`/`filter` so one
request's segments cannot collide with another's.

Personalized keys embed the owning `user_id` — user A can never hit user B's
entry. Invalidation of a user's entries uses `SCAN` (never blocking `KEYS`).

## Cold-start ladder (`cold_start_threshold()` = 5 distinct consumed items)

`cold_start_threshold()` reads `COLD_START_MAX_INTERACTIONS` (default `5`,
`app/baseline.py`) and falls back to `5` on a missing/unparsable value.
"History size" below is **distinct consumed items, not event rows** — six
views of one product is one signal — and the passive `impression`/`search`
events are not consumption, so they cannot manufacture warmth. (The content
*seed* set is event-type agnostic: it is every item the user has any event
for, capped at the 20 most recent.)

| History size | Path | `cold_start` | `strategy` |
|--------------|------|--------------|------------|
| 0 (unknown user) | trending only (no content seed) | `true` | `trending` |
| 1–4 distinct items | trending + content blend (`0.3·content + 0.2·pop`, ALS term 0.0), seeded by a TF-IDF centroid over the user's up-to-20 most recent distinct items; `content` iff a content source exists **and** top-1's unweighted content component is non-zero **and** its weighted content component strictly exceeds its weighted popularity component, else `trending` | `true` | `content` / `trending` |
| ≥ 5 distinct items | full hybrid: `0.5·als + 0.3·content + 0.2·pop`, argmax reason, available-only, suppression of seen items (passed into `model.recommend` as a filter row, so seen items do not consume the `ALS_N` candidate budget), dedup, `CANDIDATE_CAP` = 200 truncated **by blended score** (not by lexicographic id), ≤2 same-category-adjacent | `false` | `als_hybrid` |

The ALS term is the model's real dot-product min-max normalised over the
returned candidates into `[0, 1]` — best candidate exactly `1.0`, worst
exactly `0.0` — so it carries model confidence, not rank position. The
popularity and content terms are each max-normalised independently, the
ceiling being that source's own best candidate. Trending is already
min-max normalised to a *global* max of `1.0`, so this is usually a no-op
for it — though its ceiling spans unavailable items too, so a top scorer
that is unavailable leaves the best available row below `1.0` and the call
rescales. Content does get rescaled: raw cosine tops out below `1.0`
because seed items are excluded from their own neighbours.

Missing/blank pointer file forces the degraded path (`strategy="degraded"`,
`model_version="none"` — never raises). Verified live: `ghost-user-xyz` →
`{n: 3, cold_start: true, strategy: "trending", model_version: "v1"}`.

## Nightly retrain (`scripts/retrain.sh`)

```bash
bash recommendation/scripts/retrain.sh --dry-run   # side-effect-free step list
bash recommendation/scripts/retrain.sh             # real run (repo-root CWD)
# cron: 0 2 * * * cd <repo> && bash recommendation/scripts/retrain.sh >> models/retrain.log 2>&1
```

Ordered steps: stop consumer (`pkill -f`, best-effort) → drain
(`consume.py --max-batches 100`, SKIP-with-warning when broker absent) →
`train.py --version <stamp> --no-pointer` → `evaluate.py --version <stamp>`
gate → **PASS**: promote the pointer + invalidate `popular:*`; **FAIL**
(exit 3) or any error: pointer never moved + ALERT to `retrain.log` → the
consumer is restarted on every exit path.

The stamp is `date -u +%Y%m%d-%H%M%S`, so two runs on the same day cannot
clobber each other's model dir.

`--no-pointer` is load-bearing: the trainer normally writes
`current_version.txt` itself, which would make the ungated model live for
the duration of the eval. With the flag, `retrain.sh` is the only writer and
promotes on PASS alone. Pass `--no-consumer-restart` when a supervisor owns
that process.

## Eval gate (`scripts/evaluate.py --version v1 [--baseline-only]`)

Writes `models/eval_<version>.json`; exit 0 on PASS, exit 3 on FAIL.
`--baseline-only` forces the baseline-vs-baseline comparison (`delta` 0.0)
and must exit 3 — that is how you prove the gate can fail.

PASS requires **both**:

1. `NDCG_hybrid > NDCG_popularity + 0.02` (JSON key `ndcg_baseline`), and
2. `n_cold_start > 0` — at least one test user scored through the
   cold-start branch.

A run where every test user is warm fails the gate. That is deliberate: a
model whose cold-start branch was never measured has not been validated for
users with no history. `scripts/seed.py` therefore always emits 8 light
users with 1–4 events each — below `cold_start_threshold()` = 5 — and
`split_temporal_holdout` keeps all but a light user's *last* event in train
and holds that event out, so those users are scored through the cold-start
ladder instead of being routed to train and skipped.

The console table prints `delta_NDCG`, `delta_vs_oracle` and
`cold_start_coverage`; the JSON payload records `k`, `margin`, `passed`,
`n_test_users`, `n_cold_start`, `n_warm`, `ndcg_cold_start`, `ndcg_warm`,
`ndcg_category_oracle`, `delta_vs_oracle`, `strategy_counts` and
`n_rank_errors`.

### Reference run (`--version v2`, `seed=42`, `K=10`)

618 seed events / 32 users → 29 test users (500 train events, 52 holdout
items), `n_rank_errors` 0, gate **PASS**.

| metric | value |
|---|---|
| `ndcg_hybrid` | 0.26804 |
| `ndcg_baseline` (popularity) | 0.08543 |
| `delta` | +0.18262 (margin 0.02) |
| `ndcg_cold_start` / `n_cold_start` | 0.16506 / 8 |
| `ndcg_warm` / `n_warm` | 0.30728 / 21 |
| `ndcg_category_oracle` | 0.12275 |
| `delta_vs_oracle` | +0.14529 |

The cold/warm gap — 0.16506 vs 0.30728 — is the number the next
optimisation plan targets: cold-start users are still scored roughly half
as well as warm ones, even though the branch is now covered.

### The category-oracle baseline

`ndcg_category_oracle` is the ceiling reachable by a model that learns only
which *top-level category* a user likes, with no per-item signal: take the
categories of the items that user touched in the **train slice only**, then
rank by train popularity. `scripts/seed.py` draws 70% of each user's events
from 1–2 affinity categories, so this baseline is what separates "learned
something" from "learned the seed generator". The hybrid clears it by
+0.14529 on the current seed.

It is **reported, not a pass condition** — the gate arms only the two
conditions above. The oracle comparison is deferred until model quality has
been raised and the margin is known to hold.

### Read these before trusting `delta`

- **`strategy_counts`** says which code path was actually scored. On the
  current seed it is `{"als_hybrid": 21, "content": 6, "trending": 2}`, so
  the cold-start ladder is genuinely exercised rather than reported as
  `n_cold_start: 0`. A `content`/`trending` share that collapses toward zero
  drains `n_cold_start`, and at zero condition 2 fails the run — so a
  coverage regression is loud, not silent.
- **`n_rank_errors`** counts users where `rank()` raised; they are scored
  as the popularity list and bucketed under `strategy_counts` as
  `rank_error`. A non-zero value means `delta` is partly measuring the
  baseline against itself and is not interpretable as model quality.

## Backend / frontend integration (HTTP contract, spec text)

Storefront backend records every interaction and fetches recs server-side;
the browser never talks to this service directly.

- Record a view (server-to-server; use the service's 202 + `request_id` for
  dedup tracing):
  `fetch("http://recsys:8001/events", {method: "POST",
  headers: {"Content-Type": "application/json"}, body: JSON.stringify({
  user_id: "<user>", item_id: "<item>", event_type: "view",
  timestamp: new Date().toISOString()})})`
  → expect `202 {status: "queued" | "queued-buffered", request_id}`.
  Purchases must add `value: {unit_price_cents, quantity, currency}` or the
  service returns 422 — surface that as a caller bug, not a retry.
- Render homepage rail:
  `fetch("http://recsys:8001/recommendations/<user>?count=20&context=homepage")`
  → `200 {recommendations: [{item_id, score, reason}], cold_start,
  strategy, model_version}`. When `cold_start: true`, show a "Trending now"
  heading instead of "For you". Cache on `X-Cache`/`model_version`: drop
  cached rails when `model_version` changes (nightly retrain rotates it).
- "Similar items" on PDP:
  `fetch("http://recsys:8001/similar/<item>?count=10")`
  → `200 {items: [...], model_version, strategy}` (no `cold_start` key —
  do not read one).
- Health gate for deploys: `GET /health` → `status: "ok"` only with kafka
  + redis up and a model pointer present; `"degraded"` means serve
  uncached/buffered — keep serving, page only on consecutive failures.
