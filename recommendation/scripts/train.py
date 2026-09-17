"""CLI: train an implicit ALS model for ``--version``.

Usage (repo-root CWD)::

    python recommendation/scripts/train.py --version v1

Snapshots via the SHARED-lock helper (never reads live parquet), fits ALS,
writes ``recommendation/models/als_{version}/`` + the
``current_version.txt`` pointer, then deletes the snapshot dir. Empty
snapshot / no usable interactions -> ``"no training data"`` on stderr,
exit 2. MLflow failures warn but never fail training.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Repo-root on sys.path: Python puts the script's dir, not CWD, on sys.path.
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from recommendation.app.train_als import (  # noqa: E402
    MODELS_DIR,
    NoTrainingDataError,
    recommend,
    train,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI args (``--version`` required, e.g. ``v1``)."""
    parser = argparse.ArgumentParser(description="Train implicit ALS model.")
    parser.add_argument("--version", required=True, help="Model version (e.g. v1)")
    parser.add_argument(
        "--models-dir",
        default=str(MODELS_DIR),
        help="Model output root (default: recommendation/models)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Run training; return the process exit code."""
    args = parse_args(argv)
    try:
        stats = train(args.version, models_dir=Path(args.models_dir))
    except NoTrainingDataError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(
        f"trained version={stats['version']} "
        f"factors={stats['factors']} seed={stats['seed']} "
        f"iterations={stats['iterations']} "
        f"regularization={stats['regularization']}"
    )
    print(
        f"coverage: users={stats['n_users']} items={stats['n_items']} "
        f"interactions={stats['n_interactions']} pairs={stats['coverage_pairs']} "
        f"model_dir={stats['model_dir']}"
    )
    try:
        from recommendation.app.train_als import load_model

        _, mappings = load_model(Path(stats["model_dir"]))
        sample_user = mappings["user_ids"][0]
        sample = recommend(
            sample_user, n=5, model_dir=Path(stats["model_dir"])
        )
        print(f"sample recommend({sample_user!r}, 5): {sample}")
    except Exception as exc:
        print(f"warning: sample recommend failed ({exc})", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
