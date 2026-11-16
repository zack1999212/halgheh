"""Application-wide (administrator) AI defaults.

Every value comes from the environment. No provider secret is hardcoded, and the
endpoint is configurable so it can match the administrator's subscription.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

DEFAULT_PROVIDER = "zai"
DEFAULT_MODEL = "glm-4.5"


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


@dataclass(frozen=True)
class AppAIConfig:
    provider: str
    model: str
    api_key: str
    base_url: str | None
    extra: dict = field(default_factory=dict)

    @property
    def has_credentials(self) -> bool:
        return bool(self.api_key)


def _parse_extra(raw: str) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except ValueError as exc:
        raise RuntimeError("AI_DEFAULT_EXTRA_CONFIG must be valid JSON.") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("AI_DEFAULT_EXTRA_CONFIG must be a JSON object.")
    return parsed


def get_app_ai_config() -> AppAIConfig:
    """Read the application default configuration from the environment."""
    return AppAIConfig(
        provider=_env("AI_DEFAULT_PROVIDER", DEFAULT_PROVIDER) or DEFAULT_PROVIDER,
        model=_env("AI_DEFAULT_MODEL", DEFAULT_MODEL) or DEFAULT_MODEL,
        api_key=_env("AI_DEFAULT_API_KEY", ""),
        base_url=_env("AI_DEFAULT_BASE_URL", "") or None,
        extra=_parse_extra(_env("AI_DEFAULT_EXTRA_CONFIG", "")),
    )
