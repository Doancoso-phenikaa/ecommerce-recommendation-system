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
#   3. Train:
#        python recommendation/scripts/train.py --version <today YYYY-MM-DD>
#   4. Evaluate gate:
#        python recommendation/scripts/evaluate.py --version <today>
#      exit 0 = PASS, exit 3 = FAIL (exit 3 is failure, never a pass).
#   5a. PASS: read models/eval_<date>.json delta, update the
#       models/current_version.txt pointer to the new version, then invalidate
#       the popular:* Redis cache via a tiny `python -c` calling into
#       recommendation.app.store (try/except inside — best-effort, never fails
#       the run when Redis is down).
#   5b. FAIL (exit 3) or any train/eval error: KEEP the old pointer (restore
#       the pre-run value — train.py rewrites the pointer itself, so a failed
#       gate must roll it back) + append an ALERT line to
#       recommendation/models/retrain.log.
#   6. Print the "restart the consumer" note. This script never backgrounds
#      processes itself — restart the consumer manually (see NOTE below).
#
# Cron (nightly 02:00; stdout+stderr appended to the retrain log):
#   0 2 * * * cd <repo> && bash recommendation/scripts/retrain.sh >> models/retrain.log 2>&1
#
# Usage (repo-root CWD):
#   bash recommendation/scripts/retrain.sh [--dry-run]
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
VERSION="$(date +%F)"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
elif [[ $# -gt 0 ]]; then
  echo "usage: bash recommendation/scripts/retrain.sh [--dry-run]" >&2
  exit 2
fi

log() { echo "[retrain $VERSION] $*"; }

CURRENT_POINTER="none"
if [[ -f "$POINTER_FILE" ]]; then
  CURRENT_POINTER="$(cat "$POINTER_FILE")"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[retrain $VERSION] DRY-RUN — no mutations (pointer/cache/log untouched)"
  echo "[retrain $VERSION] repo root : $REPO_ROOT"
  echo "[retrain $VERSION] new version: $VERSION"
  echo "[retrain $VERSION] current pointer ($POINTER_FILE): $CURRENT_POINTER"
  echo "[retrain $VERSION] step 1: pkill -f \"recommendation/scripts/consume.py\" (best-effort, proceed regardless)"
  echo "[retrain $VERSION] step 2: python recommendation/scripts/consume.py --max-batches 100 (best-effort; SKIP with warning when broker absent)"
  echo "[retrain $VERSION] step 3: python recommendation/scripts/train.py --version $VERSION"
  echo "[retrain $VERSION] step 4: python recommendation/scripts/evaluate.py --version $VERSION (exit 0=PASS, exit 3=FAIL)"
  echo "[retrain $VERSION] gate decision logic:"
  echo "[retrain $VERSION]   read $MODELS_DIR/eval_${VERSION}.json -> delta field"
  echo "[retrain $VERSION]   PASS (exit 0): write \"$VERSION\" to $POINTER_FILE + invalidate popular:* via python -c store call (try/except, best-effort)"
  echo "[retrain $VERSION]   FAIL (exit 3) or train/eval error: restore old pointer \"$CURRENT_POINTER\" (train.py rewrites it) + append ALERT line to $RETRAIN_LOG"
  echo "[retrain $VERSION] step 5: NOTE — restart the consumer manually; this script never backgrounds processes:"
  echo "[retrain $VERSION]   python recommendation/scripts/consume.py"
  echo "[retrain $VERSION] DRY-RUN complete — pointer still: $(cat "$POINTER_FILE" 2>/dev/null || echo none)"
  exit 0
fi

log "repo root: $REPO_ROOT"
log "new version: $VERSION"

OLD_EXISTED=0
OLD_POINTER="none"
if [[ -f "$POINTER_FILE" ]]; then
  OLD_EXISTED=1
  OLD_POINTER="$(cat "$POINTER_FILE")"
fi
log "old pointer: $OLD_POINTER"

restore_pointer() {
  if [[ "$OLD_EXISTED" -eq 1 ]]; then
    printf '%s\n' "$OLD_POINTER" >"$POINTER_FILE"
  else
    rm -f "$POINTER_FILE"
  fi
}

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

# Step 3: train.
if python recommendation/scripts/train.py --version "$VERSION"; then
  log "step 3: train ok"
else
  TRAIN_RC=$?
  log "step 3: train failed (exit $TRAIN_RC) — keeping old pointer $OLD_POINTER"
  restore_pointer
  echo "$(date -u +%FT%TZ) ALERT retrain $VERSION train-failed exit=$TRAIN_RC pointer kept at $OLD_POINTER" >>"$RETRAIN_LOG"
  log "NOTE: restart the consumer manually when ready: python recommendation/scripts/consume.py (this script never backgrounds processes)"
  exit "$TRAIN_RC"
fi

# Step 4: evaluate gate (exit 0 = PASS, exit 3 = FAIL).
if python recommendation/scripts/evaluate.py --version "$VERSION"; then
  EVAL_JSON="$MODELS_DIR/eval_${VERSION}.json"
  DELTA="$(EVAL_JSON="$EVAL_JSON" python -c 'import json, os; print(json.load(open(os.environ["EVAL_JSON"]))["delta"])')"
  log "step 4: eval PASS (exit 0) delta=$DELTA"
  # Step 5a: update pointer + invalidate popular cache (best-effort).
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
  EVAL_JSON="$MODELS_DIR/eval_${VERSION}.json"
  if [[ -f "$EVAL_JSON" ]]; then
    DELTA="$(EVAL_JSON="$EVAL_JSON" python -c 'import json, os; print(json.load(open(os.environ["EVAL_JSON"]))["delta"])' 2>/dev/null || echo unknown)"
  else
    DELTA="unknown (no eval JSON)"
  fi
  if [[ "$EVAL_RC" -eq 3 ]]; then
    log "step 4: eval FAIL (exit 3) delta=$DELTA — keeping old pointer $OLD_POINTER"
  else
    log "step 4: eval error (exit $EVAL_RC) delta=$DELTA — keeping old pointer $OLD_POINTER"
  fi
  # Step 5b: keep old pointer + alert line.
  restore_pointer
  log "pointer restored to: $(cat "$POINTER_FILE" 2>/dev/null || echo none)"
  echo "$(date -u +%FT%TZ) ALERT retrain $VERSION eval-failed exit=$EVAL_RC delta=$DELTA pointer kept at $OLD_POINTER" >>"$RETRAIN_LOG"
  log "NOTE: restart the consumer manually when ready: python recommendation/scripts/consume.py (this script never backgrounds processes)"
  exit "$EVAL_RC"
fi

log "retrain $VERSION complete: pointer=$VERSION"
log "NOTE: restart the consumer manually when ready: python recommendation/scripts/consume.py (this script never backgrounds processes)"
