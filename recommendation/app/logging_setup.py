"""Central logging configuration for the recommendation service."""

from __future__ import annotations

import logging
import os
import sys


def setup_logging(level: str | int | None = None) -> None:
    """Configure root logging once (idempotent).

    :param level: log level name/number; defaults to ``LOG_LEVEL`` env var,
        falling back to ``INFO``.
    """
    if isinstance(level, str):
        resolved: str | int = level.upper()
    elif level is None:
        resolved = os.getenv("LOG_LEVEL", "INFO").upper()
    else:
        resolved = level
    logging.basicConfig(
        level=resolved,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
        force=True,
    )


def get_logger(name: str) -> logging.Logger:
    """Return a module-level logger."""
    return logging.getLogger(name)


__all__ = ["setup_logging", "get_logger"]
