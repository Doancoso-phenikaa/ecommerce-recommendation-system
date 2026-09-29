# Backend integration contract (NestJS ↔ Python)

**Status: NOT YET WIRED. The two sides currently disagree completely.**

The Python service lives on the `recommandation` branch. The NestJS backend
lives on `develop`. **The branches have never been merged** — `develop`
contains zero `.py` files, and `recommandation` contains an empty
`backend/.gitkeep`. The table below is what each side actually does today.

## The mismatch

`backend/src/modules/recommendation/recommendation.service.ts` calls the
provider via `HttpService.post()` against
`RECOMMENDATION_SERVICE_URL` + `RECOMMENDATION_SERVICE_RECOMMENDATIONS_PATH`
and parses the body with `parseRecommendationProviderResponse()`.

| | NestJS (`develop`) expects | Python (`recommandation`) serves |
|---|---|---|
| Method | `POST` | `GET` |
| Path | one env-configured path | `/recommendations/{user_id}` |
| Request body | `{customerId, mode}` | *(none — path param + query)* |
| Query params | — | `count` (1–100), `context`, `filter` |
| Response | bare array `[{productId, score}]` | `{recommendations: [...], cold_start, strategy, model_version}` |
| Item id format | `normalizeProductId` requires `/^\d+$/` | `item_id` is a slug: `ele-001`, `boo-009` |
| Auth | JWT guard on `GET /recommendations` | none |

Consequences, in order of severity:

1. `parseRecommendationProviderResponse` raises `BadGatewayException` on every
   response, because the body is an object, not an array. The endpoint is
   100% broken today.
2. Even with the shape corrected, **all 72 catalog items would be rejected**.
   `normalizeProductId` accepts only digit strings; the service returns slugs.
3. `RECOMMENDATION_SERVICE_RECOMMENDATIONS_PATH` is blank in
   `backend/.env.example`, so the URL is unconfigured out of the box.
4. `UserBehavior` rows are written to Postgres and **never published to the
   service**. Nothing calls `POST /events`, so the model would train on seed
   data only and never see production interactions.
5. The NestJS `mode: 'DEFAULT' | 'PERSONALIZED'` field has no counterpart.
   The service decides cold-start internally from interaction count and
   reports it back as `cold_start` + `strategy`; the caller should not
   compute it.

## What the Python side actually serves

All responses verified live; full detail in `recommendation/README.md`.

### `GET /recommendations/{user_id}?count=20&context=homepage&filter=`

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

- Unknown users **never 404** — they fall back internally (see `strategy`).
- Hostile ids (`:` or SCAN glob chars) → **422**.
- `X-Cache: HIT|MISS` header. Drop cached rails when `model_version` changes;
  the nightly retrain rotates it.
- `reason` is the argmax weighted component, one of `als`,
  `content_similar`, `trending` — not a causal explanation.
- `score` is **not comparable across strategies**: the cold-start path never
  renormalises, so its absolute values top out around 0.5 while
  `als_hybrid` reaches 1.0. Compare scores only within one strategy.

### `GET /similar/{item_id}?count=10`

```json
{"items": [...], "strategy": "content", "model_version": "v1"}
```

No `cold_start` key — do not read one.

### `POST /events` (ingest)

```json
{"user_id": "user-001", "item_id": "ele-001", "event_type": "view",
 "timestamp": "2026-09-17T00:00:00Z"}
```

→ `202 {"status": "queued" | "queued-buffered", "request_id": "..."}`.
`queued-buffered` means Kafka was down and the event was spooled to disk —
still accepted, not an error.

`purchase` **requires** `value: {unit_price_cents, quantity, currency}` or
the service returns 422. That is a caller bug, not a retryable condition.
One product per event: `item_id` must be scalar, and `context.items` /
`context.item_ids` are rejected on cart/purchase.

Event types: `view, click, cart, purchase, wishlist, rating, impression, search`.

### `GET /health`

`{"status": "ok"|"degraded", "kafka": "up"|"down", "redis": "up"|"down", "model_version": "v1"}`

`status: "ok"` requires Kafka + Redis up **and** a model pointer present.
`"degraded"` still serves — uncached, buffered — so keep serving and alert
rather than page on the first failure. HTTP status is always 200; branch on
the body, not the code.

## Two decisions the backend must make

**1. Which id space?** The service keys on opaque slugs (`item_id`); the
backend uses `bigint` `product_id`. Either
   - (a) publish product slugs to the service and keep `product_id` ↔ slug
       mapping in the backend (simplest, no service change), or
   - (b) teach the service the numeric ids and change the seed/catalog
       contract (larger blast radius, touches the ALS mappings).
   (a) is recommended. Note `Product.productId` is a `bigint` returned as a
   **string** by TypeORM, so the join back is string-keyed either way.

**2. Who writes events?** The service has no access to Postgres. Either
   - (a) the backend publishes to `POST /events` on every recorded behaviour
       (immediate, but couples the request path to the recsys service — it
       degrades gracefully to 202), or
   - (b) a CDC/ETL job tails `user_behaviors` (no request-path coupling,
       more moving parts).
   (a) matches the documented contract; the endpoint already never 500s.

## Mapping `mode` to the service

Drop `mode` from the request. Read the response instead:

| `mode` sent today | What the service does | What to branch on |
|---|---|---|
| `PERSONALIZED` | full hybrid when ≥5 interactions | `strategy === "als_hybrid"` |
| `DEFAULT` | trending + content blend | `cold_start === true` |

Render "Trending now" instead of "For you" when `cold_start` is true.

## Also worth knowing

- The service is **not deployed**. `docker-compose.yml` starts only Kafka and
  Redis — there is no API or consumer service, so `docker compose up` brings
  up infra with nothing to call.
- `RECOMMENDATION_SERVICE_TIMEOUT_MS` defaults to 5000. The Python
  `/recommendations` path reads two parquet files per request (uncached in
  the ranker), so the first call after a deploy is the slow one.
- Health-gate deploys on `status: "ok"`, not on the HTTP code.
