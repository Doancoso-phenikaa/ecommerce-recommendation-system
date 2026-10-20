"""Environment-based settings for the recommendation service.

All settings are read from environment variables via :func:`load_settings`.
Variables with defaults:

- ``KAFKA_BOOTSTRAP`` (default ``localhost:9092``)
- ``TOPIC`` (default ``user-events``)
- ``COLD_START_MAX_INTERACTIONS`` (default ``5``)
- ``SEED`` (default ``42``)

Required variables (missing or empty values raise :class:`ConfigError`):

- ``REDIS_URL``
- ``MODEL_DIR``
"""

from __future__ import annotations

import os
from dataclasses import dataclass


class ConfigError(Exception):
    """Raised when a required environment variable is missing or invalid."""


def _required(name: str) -> str:
    value = os.getenv(name)
    if value is None or value == "":
        raise ConfigError(f"Missing required environment variable: {name}")
    return value


def _optional(name: str, default: str) -> str:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value


def _optional_int(name: str, default: int) -> int:
    raw = _optional(name, str(default))
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(
            f"Invalid integer value for environment variable {name}: {raw!r}"
        ) from exc


@dataclass(frozen=True)
class Settings:
    """Resolved recommendation-service settings."""

    kafka_bootstrap: str
    redis_url: str
    model_dir: str
    topic: str
    cold_start_max_interactions: int
    seed: int


def load_settings() -> Settings:
    """Load settings from the environment.

    :raises ConfigError: if a required variable is missing or an
        integer variable cannot be parsed.
    """
    return Settings(
        kafka_bootstrap=_optional("KAFKA_BOOTSTRAP", "localhost:9092"),
        redis_url=_required("REDIS_URL"),
        model_dir=_required("MODEL_DIR"),
        topic=_optional("TOPIC", "user-events"),
        cold_start_max_interactions=_optional_int(
            "COLD_START_MAX_INTERACTIONS", 5
        ),
        seed=_optional_int("SEED", 42),
    )


__all__ = ["ConfigError", "Settings", "load_settings"]
