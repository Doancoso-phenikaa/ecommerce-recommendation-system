#!/usr/bin/env bash
#
# recommendation/scripts/retrain.sh — nightly retrain entrypoint.
#
# Ordered steps:
#   1. Stop the running consumer, if any:
#        pkill -f "recommendation/scripts/consume.py"   (best-effort, then
#        proceed regardless of whether a consumer was running).
#   2. Drain the topic:
#        python recommendation/scripts/consume.py --max-batches 100
#      Best-effort: when the Kafka broker is absent (e.g. Docker daemon down)
#      SKIP with a warning — never fail the script on broker absence.
#   3. Train WITHOUT promoting: `--no-pointer` leaves
#      models/current_version.txt untouched, so the ungated model is never
#      served while the gate is still running.
#   4. Evaluate gate:
#        python recommendation/scripts/evaluate.py --version <stamp>
#      exit 0 = PASS, exit 3 = FAIL (exit 3 is failure, never a pass).
#   5a. PASS: promote the pointer to the new version, then invalidate the
#       popular:* Redis cache via a tiny `python -c` calling into
#       recommendation.app.store (try/except inside — best-effort, never fails
#       the run when Redis is down).
#   5b. FAIL (exit 3) or any train/eval error: the pointer was never moved,
#       so there is nothing to roll back; append an ALERT line to
#       recommendation/models/retrain.log.
#   6. Restart the consumer. This is on by default: under cron, leaving it
#      stopped silently ends event ingestion for good. Pass
#      --no-consumer-restart to opt out when a supervisor owns the process.
#
# The version stamp is `date -u +%Y%m%d-%H%M%S` so two runs on the same day
# cannot clobber each other's model dir.
#
# Cron (nightly 02:00; stdout+stderr appended to the retrain log):
#   0 2 * * * cd <repo> && bash recommendation/scripts/retrain.sh >> models/retrain.log 2>&1
#
# Usage (repo-root CWD):
#   bash recommendation/scripts/retrain.sh [--dry-run] [--no-consumer-restart]
#
# --dry-run prints the ordered steps + gate decision logic WITHOUT mutating
# the pointer, the cache, or the log (side-effect-free; safe to run anytime).
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

MODELS_DIR="recommendation/models"
POINTER_FILE="$MODELS_DIR/current_version.txt"
RETRAIN_LOG="$MODELS_DIR/retrain.log"
VERSION="$(date -u +%Y%m%d-%H%M%S)"

DRY_RUN=0
RESTART_CONSUMER=1
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-consumer-restart) RESTART_CONSUMER=0 ;;
    *)
      echo "usage: bash recommendation/scripts/retrain.sh [--dry-run] [--no-consumer-restart]" >&2
      exit 2
      ;;
  esac
done

log() { echo "[retrain $VERSION] $*"; }
alert() { echo "$(date -u +%FT%TZ) ALERT retrain $VERSION $*" >>"$RETRAIN_LOG"; }

read_delta() {
  # Never let a malformed eval file abort the run under `set -e`.
  local json="$1"
  if [[ ! -f "$json" ]]; then
    echo "unknown (no eval JSON)"
    return 0
  fi
  python - "$json" <<'PY' 2>/dev/null || echo unknown
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        print(json.load(fh).get("delta", "unknown"))
except Exception:
    print("unknown")
PY
}

if [[ "$DRY_RUN" -eq 1 ]]; then
  CURRENT_POINTER="none"
  [[ -f "$POINTER_FILE" ]] && CURRENT_POINTER="$(tr -d '[:space:]' <"$POINTER_FILE")"
  echo "[retrain $VERSION] DRY-RUN — no mutations (pointer/cache/log untouched)"
  echo "[retrain $VERSION] repo root : $REPO_ROOT"
  echo "[retrain $VERSION] new version: $VERSION"
  echo "[retrain $VERSION] current pointer ($POINTER_FILE): $CURRENT_POINTER"
  echo "[retrain $VERSION] step 1: pkill -f \"recommendation/scripts/consume.py\" (best-effort, proceed regardless)"
  echo "[retrain $VERSION] step 2: python recommendation/scripts/consume.py --max-batches 100 (best-effort; SKIP with warning when broker absent)"
  echo "[retrain $VERSION] step 3: python recommendation/scripts/train.py --version $VERSION --no-pointer (pointer NOT moved)"
  echo "[retrain $VERSION] step 4: python recommendation/scripts/evaluate.py --version $VERSION (exit 0=PASS, exit 3=FAIL)"
  echo "[retrain $VERSION] gate decision logic:"
  echo "[retrain $VERSION]   read $MODELS_DIR/eval_${VERSION}.json -> delta field (defaults to 'unknown', never aborts)"
  echo "[retrain $VERSION]   PASS (exit 0): write \"$VERSION\" to $POINTER_FILE + invalidate popular:* via python -c store call (try/except, best-effort)"
  echo "[retrain $VERSION]   FAIL (exit 3) or train/eval error: pointer was never moved, so nothing to restore; append ALERT to $RETRAIN_LOG"
  if [[ "$RESTART_CONSUMER" -eq 1 ]]; then
    echo "[retrain $VERSION] step 5: restart consumer: nohup python recommendation/scripts/consume.py &"
  else
    echo "[retrain $VERSION] step 5: SKIP consumer restart (--no-consumer-restart)"
  fi
  echo "[retrain $VERSION] DRY-RUN complete — pointer still: $(tr -d '[:space:]' <"$POINTER_FILE" 2>/dev/null || echo none)"
  exit 0
fi

log "repo root: $REPO_ROOT"
log "new version: $VERSION"

OLD_POINTER="none"
[[ -f "$POINTER_FILE" ]] && OLD_POINTER="$(tr -d '[:space:]' <"$POINTER_FILE")"
log "old pointer: $OLD_POINTER"

# The consumer is stopped in step 1 and must come back no matter how this
# script exits, or ingestion ends silently under cron.
restart_consumer() {
  if [[ "$RESTART_CONSUMER" -eq 0 ]]; then
    log "consumer restart skipped (--no-consumer-restart); start it yourself: python recommendation/scripts/consume.py"
    return 0
  fi
  nohup python recommendation/scripts/consume.py >"$MODELS_DIR/consumer.log" 2>&1 &
  log "consumer restarted (pid $!), logging to $MODELS_DIR/consumer.log"
}
trap restart_consumer EXIT

# Step 1: stop consumer (best-effort, proceed regardless).
if pkill -f "recommendation/scripts/consume.py" 2>/dev/null; then
  log "step 1: consumer signalled to stop"
else
  log "step 1: no consumer running (best-effort, continuing)"
fi

# Step 2: drain (best-effort — never fail on broker absence).
if python recommendation/scripts/consume.py --max-batches 100; then
  log "step 2: drain complete"
else
  log "step 2: WARNING — drain skipped (broker absent or consumer error), continuing"
fi

# Step 3: train. `--no-pointer` keeps the live pointer on the old model so
# the gate below decides promotion, not the trainer.
if python recommendation/scripts/train.py --version "$VERSION" --no-pointer; then
  log "step 3: train ok (pointer still $OLD_POINTER, promotion gated)"
else
  TRAIN_RC=$?
  log "step 3: train failed (exit $TRAIN_RC) — pointer untouched at $OLD_POINTER"
  alert "train-failed exit=$TRAIN_RC pointer kept at $OLD_POINTER"
  exit "$TRAIN_RC"
fi

# Step 4: evaluate gate (exit 0 = PASS, exit 3 = FAIL).
if python recommendation/scripts/evaluate.py --version "$VERSION"; then
  DELTA="$(read_delta "$MODELS_DIR/eval_${VERSION}.json")"
  log "step 4: eval PASS (exit 0) delta=$DELTA"
  # Step 5a: promote the pointer, then invalidate the popular cache.
  printf '%s\n' "$VERSION" >"$POINTER_FILE"
  log "pointer updated: $OLD_POINTER -> $VERSION"
  if python -c '
try:
    from recommendation.app import store
    client = store.get_redis()
    keys = list(client.scan_iter(match="popular:*"))
    n = int(client.delete(*keys)) if keys else 0
    print(f"[retrain] popular cache invalidated: {n} keys")
except Exception as exc:
    print(f"[retrain] WARNING — popular cache invalidation skipped ({exc})")
'; then
    log "popular cache invalidation attempted (best-effort)"
  else
    log "WARNING — popular cache invalidation helper failed, continuing"
  fi
else
  EVAL_RC=$?
  DELTA="$(read_delta "$MODELS_DIR/eval_${VERSION}.json")"
  if [[ "$EVAL_RC" -eq 3 ]]; then
    log "step 4: eval FAIL (exit 3) delta=$DELTA — pointer never moved, still $OLD_POINTER"
  else
    log "step 4: eval error (exit $EVAL_RC) delta=$DELTA — pointer never moved, still $OLD_POINTER"
  fi
  alert "eval-failed exit=$EVAL_RC delta=$DELTA pointer kept at $OLD_POINTER"
  exit "$EVAL_RC"
fi

log "retrain $VERSION complete: pointer=$VERSION"
