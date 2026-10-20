"""Kafka consumer runner: drain user-events -> parquet + redis (todo 6).

Usage (repo-root CWD)::

    uv run python recommendation/scripts/consume.py [--once] [--max-batches N]
    uv run python recommendation/scripts/consume.py --batch-size 100 --poll-timeout-ms 1000

``retrain.sh`` (todo 16) stops this consumer before training — the
``--max-batches`` / ``--once`` flags let retrain drain-then-exit instead of
running forever. Offsets commit AFTER persist (commit-after-write), so a
crash before commit replays without loss (idempotent on ``request_id``).
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from recommendation.app.config import load_settings  # noqa: E402
from recommendation.app.consumer import (  # noqa: E402
    INCOMING_DIR,
    INTERACTIONS_PATH,
    MERGE_LOCK_PATH,
    RECSYS_GROUP,
    process_batch,
)

__all__ = ["build_consumer", "run", "main"]

log = logging.getLogger("recsys.consume")


def build_consumer(
    bootstrap_servers: str,
    topic: str,
    group_id: str = RECSYS_GROUP,
):
    """Create the KafkaConsumer (group ``recsys-v1``, manual commit).

    ``enable_auto_commit=False`` — offsets commit only after the batch has
    been persisted (commit-after-write, no loss on crash).
    """
    from kafka import KafkaConsumer

    return KafkaConsumer(
        topic,
        bootstrap_servers=bootstrap_servers,
        group_id=group_id,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
        key_deserializer=lambda k: k.decode("utf-8") if k else None,
    )


def run(
    max_batches: int | None = None,
    batch_size: int = 100,
    poll_timeout_ms: int = 1000,
) -> dict[str, int]:
    """Poll-consume loop; return totals {batches, received, valid, ...}.

    ``max_batches=None`` runs forever; ``--once`` / ``--max-batches N``
    drains then exits (for ``retrain.sh``). Each poll batch goes through
    :func:`process_batch` (validate -> parquet -> merge dedup -> redis),
    and ``consumer.commit()`` runs only after persist.
    """
    settings = load_settings()
    consumer = build_consumer(settings.kafka_bootstrap, settings.topic)
    totals = {
        "batches": 0,
        "received": 0,
        "valid": 0,
        "malformed": 0,
        "dlq_sent": 0,
    }
    empty_polls = 0
    try:
        while True:
            polled = consumer.poll(
                timeout_ms=poll_timeout_ms, max_records=batch_size
            )
            records: list = []
            for _tp, msgs in polled.items():
                records.extend(msgs)
            if not records:
                if max_batches is not None:
                    # Drain mode: exit after 3 consecutive empty polls
                    # (--once exits on the very first empty poll).
                    empty_polls += 1
                    limit = 1 if max_batches == 1 and totals["batches"] == 0 else 3
                    if empty_polls >= limit and (
                        max_batches == 1 or totals["batches"] > 0 or empty_polls >= 3
                    ):
                        break
                continue
            empty_polls = 0
            stats = process_batch(
                records,
                incoming_dir=INCOMING_DIR,
                interactions_path=INTERACTIONS_PATH,
                lock_path=MERGE_LOCK_PATH,
                commit_callback=None,
            )
            consumer.commit()
            totals["batches"] += 1
            for key in ("received", "valid", "malformed", "dlq_sent"):
                totals[key] += stats[key]
            log.info(
                "batch=%d received=%d valid=%d malformed=%d dlq=%d merged=%d",
                totals["batches"],
                stats["received"],
                stats["valid"],
                stats["malformed"],
                stats["dlq_sent"],
                stats["merged"],
            )
            if max_batches is not None and totals["batches"] >= max_batches:
                break
    finally:
        try:
            consumer.close()
        except Exception:
            pass
    return totals


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process a single batch (or exit on first empty poll), then exit",
    )
    parser.add_argument(
        "--max-batches",
        type=int,
        default=None,
        help="Exit after N batches (drain-then-exit for retrain.sh)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Max records per poll batch (default: %(default)s)",
    )
    parser.add_argument(
        "--poll-timeout-ms",
        type=int,
        default=1000,
        help="Poll timeout in ms (default: %(default)s)",
    )
    args = parser.parse_args(argv)
    max_batches = args.max_batches
    if args.once and max_batches is None:
        max_batches = 1
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    totals = run(
        max_batches=max_batches,
        batch_size=args.batch_size,
        poll_timeout_ms=args.poll_timeout_ms,
    )
    print(
        f"batches={totals['batches']} received={totals['received']} "
        f"valid={totals['valid']} malformed={totals['malformed']} "
        f"dlq_sent={totals['dlq_sent']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
