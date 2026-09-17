"""CLI for the offline evaluation gate (todo 12).

Usage (repo-root CWD)::

    python recommendation/scripts/evaluate.py --version v1 [--baseline-only]

Prints a metric table, writes ``recommendation/models/eval_{version}.json``
``{ndcg_hybrid, ndcg_baseline, delta, precision, recall, map, version,
seed}``, and exits 0 on PASS (``NDCG_hybrid > NDCG_baseline + 0.02``)
else exits 3 on FAIL. Exit 3 is FAILURE, never an alternative pass.

``--baseline-only`` forces the baseline-vs-baseline comparison (delta
0.0), which must exit 3 — proving the gate can fail.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Repo-root CWD contract: `recommendation.app.*` must be importable.
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from recommendation.app.evaluate import MARGIN, evaluate  # noqa: E402

FAIL_EXIT = 3


def _table(res: dict) -> str:
    lines = [
        f"offline eval gate: version={res['version']} seed={res['seed']} "
        f"K={res['k']} test_users={res['n_test_users']} "
        f"train_events={res['n_train_events']} "
        f"holdout_items={res['n_holdout_events']}",
        f"{'metric':<12}{'hybrid':>10}{'baseline':>10}",
        f"{'precision@K':<12}{res['precision']:>10.4f}{res['precision_baseline']:>10.4f}",
        f"{'recall@K':<12}{res['recall']:>10.4f}{res['recall_baseline']:>10.4f}",
        f"{'NDCG@K':<12}{res['ndcg_hybrid']:>10.4f}{res['ndcg_baseline']:>10.4f}",
        f"{'MAP@K':<12}{res['map']:>10.4f}{res['map_baseline']:>10.4f}",
        f"delta_NDCG={res['delta']:+.4f} margin={MARGIN:.2f} "
        f"-> {'PASS' if res['passed'] else 'FAIL'}",
    ]
    if res.get("baseline_only"):
        lines.append("(baseline-only mode: hybrid := baseline, delta must be 0)")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Offline NDCG@K eval gate.")
    parser.add_argument("--version", default="v1")
    parser.add_argument("--baseline-only", action="store_true")
    args = parser.parse_args(argv)

    res = evaluate(version=args.version, baseline_only=args.baseline_only)
    print(_table(res), flush=True)

    out_path = _REPO_ROOT / "recommendation" / "models" / f"eval_{args.version}.json"
    payload = {
        "ndcg_hybrid": res["ndcg_hybrid"],
        "ndcg_baseline": res["ndcg_baseline"],
        "delta": res["delta"],
        "precision": res["precision"],
        "recall": res["recall"],
        "map": res["map"],
        "version": res["version"],
        "seed": res["seed"],
    }
    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out_path}", flush=True)
    return 0 if res["passed"] else FAIL_EXIT


if __name__ == "__main__":
    raise SystemExit(main())
