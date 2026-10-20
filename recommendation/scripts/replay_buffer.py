"""Redrive broker-down spool lines back through publish_event (todo 5).

Usage (repo-root CWD):
    uv run python recommendation/scripts/replay_buffer.py [--spool PATH] [--dry-run]

Each JSON line of the spool file is parsed as EventIn and republished via
publish_event. Lines that publish OK are dropped; lines that raise
BusUnavailable (broker still down) or fail validation are kept. The spool
file is rewritten atomically with only the unprocessed lines.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from recommendation.app.bus import (  # noqa: E402
    BusUnavailable,
    default_spool_path,
    publish_event,
)
from recommendation.app.schemas import EventIn  # noqa: E402

__all__ = ["replay_spool"]


def replay_spool(spool: Path, dry_run: bool = False) -> dict[str, int]:
    """Replay spool lines; return counts {total, republished, kept}."""
    if not spool.exists():
        return {"total": 0, "republished": 0, "kept": 0}
    with open(spool, "r", encoding="utf-8") as fh:
        lines = [ln for ln in fh.read().splitlines() if ln.strip()]
    kept: list[str] = []
    republished = 0
    for line in lines:
        try:
            event = EventIn.model_validate_json(line)
        except Exception:
            kept.append(line)
            continue
        if dry_run:
            kept.append(line)
            continue
        try:
            publish_event(event, spool_path=spool, spool_on_failure=False)
        except BusUnavailable:
            kept.append(line)
            break
        republished += 1
    if not dry_run:
        tmp = spool.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            for line in kept:
                fh.write(line + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, spool)
    return {"total": len(lines), "republished": republished, "kept": len(kept)}


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint for spool replay."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--spool",
        type=Path,
        default=default_spool_path(),
        help="Spool file to replay (default: %(default)s)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and count lines without publishing or modifying the file",
    )
    args = parser.parse_args(argv)
    stats = replay_spool(args.spool, dry_run=args.dry_run)
    print(
        f"total={stats['total']} "
        f"republished={stats['republished']} kept={stats['kept']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
