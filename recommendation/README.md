# Recommendation Service

Personalized product recommendations for the storefront: a FastAPI serving
layer over an implicit-ALS hybrid ranker, fed by a Kafka event pipeline and
refreshed by a nightly retrain gate. All commands below run from the **repo
root**. Python: `recommendation/.venv/bin/python` (venv) with `PYTHONPATH=.`.

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
| `recs:{user}:{context}:{filter}:{model_version}` | personalized recs | 120 default, clamped to [60, 300] |
| `similar:{item}` | content neighbours    | 21600 (6 h)      |
| `popular:{page}` | global trending page  | 300              |
| `session:{id}`   | per-session hash      | 1800 (30 min)    |

Personalized keys embed the owning `user_id` — user A can never hit user B's
entry. Invalidation of a user's entries uses `SCAN` (never blocking `KEYS`).

## Cold-start ladder (`cold_start_threshold()` = 5 interactions)

| History size | Path | `cold_start` | `strategy` |
|--------------|------|--------------|------------|
| 0 (unknown user) | trending only (no content seed) | `true` | `trending` |
| 1–4 | trending + content blend (seeded by most-recent item); `content` iff a content source exists **and** top-1's weighted content component strictly exceeds its popularity component, else `trending` | `true` | `content` / `trending` |
| ≥ 5 | full hybrid: `0.5·als + 0.3·content + 0.2·pop`, argmax reason, available-only, suppression of seen items, dedup, ≤2 same-category-adjacent | `false` | `als_hybrid` |

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
`train.py --version <date>` → `evaluate.py --version <date>` gate → read
`models/eval_<date>.json` delta: **PASS** (exit 0) updates
`current_version.txt` + invalidates `popular:*` (best-effort `python -c`
with try/except); **FAIL** (exit 3) restores the old pointer (train.py
rewrites it on success) + appends an `ALERT` line to `retrain.log`. Ends
with a restart-the-consumer NOTE — the script never backgrounds processes.

## Eval gate (`scripts/evaluate.py --version v1 [--baseline-only]`)

Writes `models/eval_<version>.json`
`{ndcg_hybrid, ndcg_baseline, delta, precision, recall, map, version, seed}`;
PASS iff `NDCG_hybrid > NDCG_baseline + 0.02`, exit 0, else exit 3.
`--baseline-only` forces delta 0.0 / exit 3 (proves the gate can fail).
Reference: `eval_v1.json` delta `+0.1999` (PASS).

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
