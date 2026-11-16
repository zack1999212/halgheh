"""Provider-independent AI architecture.

Each provider is described by identity, API style, default model and a catalogue
of known models with capability metadata. Credentials, base URL and model are
kept separately by the caller, so a future provider with a different wire
format can be added by registering another ``ProviderSpec`` and handling its
``api_style`` in :func:`build_request_config`.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelCapabilities:
    # None means "unknown" rather than "unsupported".
    chat_completion: bool | None = None
    tool_calling: bool | None = None
    structured_tool_arguments: bool | None = None


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    capabilities: ModelCapabilities


@dataclass(frozen=True)
class ProviderSpec:
    id: str
    label: str
    api_style: str
    default_model: str
    models: tuple[ModelSpec, ...]
    default_base_url: str | None = None
    supports_custom_base_url: bool = True
    supports_manual_model: bool = True

    def known_model(self, model_id: str) -> ModelSpec | None:
        for model in self.models:
            if model.id == model_id:
                return model
        return None


# Z.ai exposes an OpenAI-compatible API. Only models whose capabilities we can
# state with confidence are listed; any other identifier may still be entered
# manually and is reported as "known: false" with unknown capabilities.
ZAI_MODELS: tuple[ModelSpec, ...] = (
    ModelSpec(
        id="glm-4.5",
        label="GLM-4.5",
        capabilities=ModelCapabilities(
            chat_completion=True,
            tool_calling=True,
            structured_tool_arguments=True,
        ),
    ),
)

PROVIDERS: dict[str, ProviderSpec] = {
    "zai": ProviderSpec(
        id="zai",
        label="Z.ai",
        api_style="openai",
        default_model="glm-4.5",
        models=ZAI_MODELS,
        # The correct endpoint depends on the administrator's subscription and
        # is supplied through AI_DEFAULT_BASE_URL, never hardcoded here.
        default_base_url=None,
    ),
}


def get_provider(provider_id: str) -> ProviderSpec | None:
    return PROVIDERS.get(provider_id)


def list_providers() -> list[ProviderSpec]:
    return list(PROVIDERS.values())


def resolve_model(provider_id: str, model_id: str) -> ModelSpec | None:
    provider = get_provider(provider_id)
    if provider is None:
        return None
    return provider.known_model(model_id)


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
