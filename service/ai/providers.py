"""Provider-independent AI architecture.

Each provider is described by identity, API style, default model and a catalogue
of known models with capability metadata. Credentials, base URL and model are
kept separately by the caller, so a future provider with a different wire
format can be added by registering another ``ProviderSpec`` and handling its
``api_style`` in :func:`build_request_config`.

Error classification and retry logic are provided by ``service.ai.error_classification``.
"""

from __future__ import annotations

import json
import time
import random
import socket
import urllib.error
import urllib.request
from typing import Any

from dataclasses import dataclass

from .error_classification import ErrorCategory, classify_error, ClassifiedError


class ProviderError(Exception):
    """A safe, user-presentable provider failure.

    The message is always suitable to show to the user; provider internals are
    never included. ``classified`` carries the category/retry guidance.
    """

    def __init__(
        self,
        message: str,
        classified: ClassifiedError | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.classified = classified


@dataclass(frozen=True)
class ModelCapabilities:
    # None means "unknown" rather than "unsupported".
    chat_completion: bool | None = None
    tool_calling: bool | None = None
    structured_tool_arguments: bool | None = None


@dataclass(frozen=True)
class ProviderSpec:
    """Identity and wire format of a provider.

    The models a provider offers live in the ``provider_models`` catalogue
    table, not here, so a single source of truth decides which upstream model
    identifiers may be sent. ``default_model`` is only the seed value used when
    no application, user or conversation selection exists.
    """

    id: str
    label: str
    api_style: str
    default_model: str
    default_base_url: str | None = None
    supports_custom_base_url: bool = True
    supports_manual_model: bool = True
    supports_model_discovery: bool = False


PROVIDERS: dict[str, ProviderSpec] = {
    "zai": ProviderSpec(
        id="zai",
        label="Z.ai",
        api_style="openai",
        default_model="glm-4.5-flash",
        # Standard pay-as-you-go endpoint. The GLM Coding Plan uses a different
        # endpoint (https://api.z.ai/api/coding/paas/v4) which an administrator
        # or user selects explicitly as a custom base URL; Halgheh never
        # switches between the two on its own.
        default_base_url="https://api.z.ai/api/paas/v4",
        supports_model_discovery=True,
    ),
}


def get_provider(provider_id: str) -> ProviderSpec | None:
    return PROVIDERS.get(provider_id)


def list_providers() -> list[ProviderSpec]:
    return list(PROVIDERS.values())


@dataclass(frozen=True)
class RequestConfig:
    api_style: str
    url: str | None
    headers: dict[str, str]


def build_request_config(
    *,
    provider: ProviderSpec,
    base_url: str | None,
    api_key: str,
    model: str,
    extra: dict | None = None,
) -> RequestConfig:
    """Build provider-specific request configuration for a chat call.

    Only the OpenAI-compatible wire format is implemented today. A provider with
    a different format adds a branch here without changing the resolver or the
    credential model.
    """
    if provider.api_style == "openai":
        base = (base_url or "").rstrip("/")
        url = f"{base}/chat/completions" if base else None
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        return RequestConfig(api_style=provider.api_style, url=url, headers=headers)
    raise ValueError(f"Unsupported provider API style: {provider.api_style}")


def _post_json(
    url: str,
    headers: dict[str, str],
    body: dict[str, Any],
    timeout: int,
) -> dict[str, Any]:
    """Send a JSON POST request and return the parsed response.

    Uses centralized error classification to categorize failures and
    returns a ClassifiedError-decorated ProviderError when appropriate.

    The caller (``run_turn``) catches ProviderError and converts it to
    an HTTP 502 with a safe, user-facing message.
    """
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()

        try:
            return json.loads(raw)
        except ValueError as exc:
            raise ProviderError(
                "The AI provider returned an invalid response."
            ) from exc

    except ProviderError:
        raise

    except urllib.error.HTTPError as exc:
        # The provider answered with an error status. Classify it so the user
        # gets actionable guidance instead of a raw provider body.
        provider_code, provider_message = _parse_error_body(exc)
        classified = classify_error(
            http_status=exc.code,
            provider_error_code=provider_code,
            provider_error_message=provider_message,
        )
        raise ProviderError(classified.human_message, classified) from exc

    except (urllib.error.URLError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        message = str(reason) or str(exc)
        is_timeout = (
            isinstance(exc, TimeoutError)
            or isinstance(reason, TimeoutError)
            or "timed out" in message.lower()
        )
        is_refused = isinstance(
            exc, (ConnectionRefusedError, ConnectionResetError)
        ) or isinstance(reason, (ConnectionRefusedError, ConnectionResetError))

        if isinstance(reason, socket.gaierror):
            classified = classify_error(provider_error_message="dns resolution failed")
            human_message = (
                "Could not reach the AI provider. Check your DNS and try again."
            )
        elif is_timeout:
            classified = classify_error(provider_error_message="read timeout")
            human_message = "The AI provider request timed out. Please try again."
        elif is_refused:
            classified = classify_error(provider_error_message="could not connect")
            human_message = (
                "Could not connect to the AI provider. The server may be "
                "temporarily unavailable."
            )
        elif "ssl" in message.lower() or "eof" in message.lower():
            classified = classify_error(provider_error_message="could not connect")
            human_message = (
                "The TLS connection to the AI provider was interrupted. Check "
                "your network or VPN and try again."
            )
        else:
            classified = classify_error(provider_error_message=message)
            human_message = classified.human_message
        raise ProviderError(human_message, classified) from exc

    except Exception as exc:
        classified = classify_error(provider_error_message=str(exc))
        raise ProviderError(
            "The AI provider returned an unexpected error.", classified
        ) from exc


def _parse_error_body(exc: urllib.error.HTTPError) -> tuple[str | None, str]:
    """Extract a provider error code and message from an HTTP error body.

    Returns safe text only; the raw body is never propagated to the client.
    """
    try:
        raw = exc.read()
    except Exception:
        raw = b""
    try:
        payload = json.loads(raw) if raw else {}
    except ValueError:
        return None, (raw[:500].decode("utf-8", "replace") if raw else str(exc))

    if not isinstance(payload, dict):
        return None, str(exc)

    error = payload.get("error")
    if isinstance(error, dict):
        code = error.get("code") or error.get("type")
        message = error.get("message") or str(exc)
    else:
        code = payload.get("code") or payload.get("error_code")
        message = payload.get("message") or str(error or exc)
    return (str(code) if code else None), str(message)