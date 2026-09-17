#!/usr/bin/env bash
# SOLE source of truth for Kafka topics (auto-create is disabled in compose).
# Creates: user-events (partitions=3), user-events-dlq (partitions=1).
# Idempotent: existing topics are skipped. Address containers ONLY by fixed
# names (kafka); never discover container names.
set -euo pipefail

BOOTSTRAP="localhost:9092"
KAFKA_TOPICS="/opt/kafka/bin/kafka-topics.sh"

ensure_topic() {
  local topic="$1"
  local partitions="$2"
  if docker exec kafka "$KAFKA_TOPICS" --list --bootstrap-server "$BOOTSTRAP" 2>/dev/null | grep -qx "$topic"; then
    echo "exists: $topic"
  else
    echo "creating: $topic (partitions=$partitions)"
    docker exec kafka "$KAFKA_TOPICS" --create \
      --topic "$topic" \
      --bootstrap-server "$BOOTSTRAP" \
      --partitions "$partitions" \
      --replication-factor 1
  fi
}

ensure_topic "user-events" 3
ensure_topic "user-events-dlq" 1

echo "--- topic list ---"
docker exec kafka "$KAFKA_TOPICS" --list --bootstrap-server "$BOOTSTRAP"
