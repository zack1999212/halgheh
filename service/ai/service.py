from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import repository
from .catalog import capabilities_of, find_model, require_selectable_model
from .config import get_app_ai_config
from .crypto import decrypt_secret, encrypt_secret, mask_secret
from .error_classification import ErrorCategory, classify_error, ClassifiedError
from .models import ProviderModel
from .providers import (
    ModelCapabilities,
    ProviderError,
    ProviderSpec,
    get_provider,
    list_providers,
    build_request_config,
    _post_json as _provider_post_json,
)
from .schemas import (
    AICredentialCreate,
    AICredentialResponse,
    AICredentialUpdate,
    CatalogResponse,
    ConnectionCheckResponse,
    EffectiveConfigResponse,
    ModelCapabilitiesOut,
    ModelCreate,
    ModelOut,
    ModelRefreshResponse,
    ModelToolCheckResponse,
    ModelUpdate,
    ProviderOut,
)


def _caps_out(caps: ModelCapabilities) -> ModelCapabilitiesOut:
    return ModelCapabilitiesOut(
        chat_completion=caps.chat_completion,
        tool_calling=caps.tool_calling,
        structured_tool_arguments=caps.structured_tool_arguments,
    )


def _model_out(model: ProviderModel) -> ModelOut:
    return ModelOut(
        id=model.id,
        provider=model.provider_id,
        upstream_model_id=model.upstream_model_id,
        label=model.display_name,
        description=model.description,
        context_window=model.context_window,
        max_output_tokens=model.max_output_tokens,
        supports_tools=model.supports_tools,
        supports_streaming=model.supports_streaming,
        supports_vision=model.supports_vision,
        enabled=model.enabled,
        pricing_class=model.pricing_class,
        input_price_per_mtok=(
            float(model.input_price_per_mtok)
            if model.input_price_per_mtok is not None
            else None
        ),
        output_price_per_mtok=(
            float(model.output_price_per_mtok)
            if model.output_price_per_mtok is not None
            else None
        ),
        is_custom=model.is_custom,
        is_discovered=model.is_discovered,
        capabilities=_caps_out(capabilities_of(model)),
        known=True,
    )


def _provider_or_422(provider_id: str) -> ProviderSpec:
    provider = get_provider((provider_id or "").strip().lower())
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown AI provider: {provider_id}",
        )
    return provider


def _credential_response(db: Session, credential) -> AICredentialResponse:
    provider = get_provider(credential.provider)
    model = (
        find_model(db, credential.provider, credential.model) if provider else None
    )
    caps = capabilities_of(model) if model is not None else ModelCapabilities()

    try:
        masked = mask_secret(decrypt_secret(credential.api_key_encrypted))
    except ValueError:
        # Listing must never fail or reveal the stored value.
        masked = "\u2022\u2022\u2022\u2022"

    return AICredentialResponse(
        id=credential.id,
        provider=credential.provider,
        provider_label=provider.label if provider else credential.provider,
        model=credential.model,
        model_label=model.display_name if model is not None else None,
        pricing_class=model.pricing_class if model is not None else "unknown",
        base_url=credential.base_url,
        name=credential.name,
        has_credentials=bool(credential.api_key_encrypted),
        api_key_masked=masked,
        is_active=credential.is_active,
        model_known=model is not None,
        capabilities=_caps_out(caps),
        created_at=credential.created_at,
        updated_at=credential.updated_at,
    )


# --- Catalogue ---

def get_catalog(db: Session) -> CatalogResponse:
    providers: list[ProviderOut] = []
    for provider in list_providers():
        rows = repository.list_models(db, provider_id=provider.id)
        providers.append(
            ProviderOut(
                id=provider.id,
                label=provider.label,
                api_style=provider.api_style,
                default_base_url=provider.default_base_url,
                default_model=provider.default_model,
                supports_custom_base_url=provider.supports_custom_base_url,
                supports_manual_model=provider.supports_manual_model,
                supports_model_discovery=provider.supports_model_discovery,
                models=[_model_out(row) for row in rows],
            )
        )
    return CatalogResponse(providers=providers)


def list_models(
    db: Session,
    provider_id: str | None = None,
    *,
    enabled_only: bool = False,
    compatible_with_agent: str | None = None,
) -> list[ModelOut]:
    from .catalog import is_compatible_with_agent

    if provider_id:
        _provider_or_422(provider_id)
    rows = repository.list_models(
        db, provider_id=provider_id, enabled_only=enabled_only
    )
    result: list[ModelOut] = []
    for row in rows:
        if compatible_with_agent and not is_compatible_with_agent(
            row, compatible_with_agent
        ):
            continue
        result.append(_model_out(row))
    return result


# --- Model management ---

def create_model(db: Session, provider_id: str, data: ModelCreate) -> ModelOut:
    provider = _provider_or_422(provider_id)
    if repository.get_model_by_upstream(
        db, provider.id, data.upstream_model_id
    ) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{data.upstream_model_id} is already in the {provider.label} "
                "catalogue."
            ),
        )

    model = repository.create_model(
        db,
        provider_id=provider.id,
        upstream_model_id=data.upstream_model_id,
        display_name=data.display_name,
        description=data.description,
        context_window=data.context_window,
        max_output_tokens=data.max_output_tokens,
        supports_tools=data.supports_tools,
        supports_streaming=data.supports_streaming,
        supports_vision=data.supports_vision,
        enabled=data.enabled,
        pricing_class=data.pricing_class,
        input_price_per_mtok=data.input_price_per_mtok,
        output_price_per_mtok=data.output_price_per_mtok,
        is_custom=True,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not add the model. Please try again.",
        )
    db.refresh(model)
    return _model_out(model)


def _require_model_or_404(db: Session, model_id: int) -> ProviderModel:
    model = repository.get_model(db, model_id)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Model not found"
        )
    return model


def update_model(db: Session, model_id: int, data: ModelUpdate) -> ModelOut:
    model = _require_model_or_404(db, model_id)
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Update body must not be empty",
        )

    for attribute in (
        "display_name",
        "description",
        "context_window",
        "max_output_tokens",
        "supports_tools",
        "supports_streaming",
        "supports_vision",
        "enabled",
        "pricing_class",
        "input_price_per_mtok",
        "output_price_per_mtok",
    ):
        if attribute in updates:
            setattr(model, attribute, updates[attribute])

    db.commit()
    db.refresh(model)
    return _model_out(model)


def delete_model(db: Session, model_id: int) -> None:
    model = _require_model_or_404(db, model_id)
    # User-entered and discovery-added models may be removed; only the seeded
    # catalogue is protected, and those can still be disabled.
    if not (model.is_custom or model.is_discovered):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Built-in catalogue models cannot be removed. Disable it instead."
            ),
        )

    conversations, credentials = repository.count_model_references(
        db,
        provider_id=model.provider_id,
        upstream_model_id=model.upstream_model_id,
    )
    if conversations or credentials:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This model is still used by "
                f"{conversations} conversation(s) and {credentials} personal "
                "configuration(s). Disable it instead of removing it."
            ),
        )

    repository.delete_model(db, model)
    db.commit()


def _discover_upstream_models(
    provider: ProviderSpec, base_url: str, api_key: str
) -> list[dict[str, Any]]:
    """Ask the provider for its model list (OpenAI-compatible ``/models``)."""
    import urllib.error
    import urllib.request

    url = f"{base_url.rstrip('/')}/models"
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                f"{provider.label} does not support model discovery on this "
                "endpoint. Add models manually instead."
            ),
        ) from exc
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                f"Could not reach {provider.label} to refresh models. "
                "Add models manually instead."
            ),
        ) from exc

    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                f"{provider.label} returned an unexpected model list. "
                "Add models manually instead."
            ),
        )

    discovered: list[dict[str, Any]] = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        upstream = str(entry.get("id") or "").strip()
        if upstream:
            discovered.append(entry)
    return discovered


def refresh_models(
    db: Session,
    user_id: int,
    provider_id: str,
) -> ModelRefreshResponse:
    provider = _provider_or_422(provider_id)
    if not provider.supports_model_discovery:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{provider.label} does not support automatic model discovery. "
                "Add models manually."
            ),
        )

    config = resolve_runtime_config(db, user_id)
    if config.provider != provider.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Configure a {provider.label} connection and use it before "
                "refreshing its catalogue."
            ),
        )
    if not config.api_key or not config.base_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No {provider.label} endpoint or API key is configured.",
        )

    discovered = _discover_upstream_models(provider, config.base_url, config.api_key)
    added = 0
    updated = 0
    for entry in discovered:
        upstream = str(entry.get("id")).strip()
        existing = repository.get_model_by_upstream(db, provider.id, upstream)
        if existing is None:
            repository.create_model(
                db,
                provider_id=provider.id,
                upstream_model_id=upstream,
                display_name=upstream,
                description="Discovered from the provider model list.",
                context_window=None,
                max_output_tokens=None,
                supports_tools=None,
                supports_streaming=None,
                supports_vision=None,
                enabled=True,
                pricing_class="unknown",
                is_custom=False,
                is_discovered=True,
            )
            added += 1
        else:
            # Discovery never rewrites curated metadata; it only notes that the
            # model still exists upstream.
            updated += 1

    db.commit()
    return ModelRefreshResponse(
        provider=provider.id,
        discovered=len(discovered),
        added=added,
        updated=updated,
        models=list_models(db, provider.id),
    )


def check_model_tools(db: Session, user_id: int, model_id: int) -> ModelToolCheckResponse:
    """Probe whether a model really supports tool calling, and store the result.

    A successful probe marks ``supports_tools`` true; a provider rejection marks
    it false. Network or billing failures leave the metadata untouched.
    """
    model = _require_model_or_404(db, model_id)
    provider = _provider_or_422(model.provider_id)

    config = resolve_runtime_config(db, user_id)
    if config.provider != provider.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Use a {provider.label} connection before checking its models."
            ),
        )

    request_config = build_request_config(
        provider=provider,
        base_url=config.base_url,
        api_key=config.api_key,
        model=model.upstream_model_id,
        extra=config.extra,
    )
    if not request_config.url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not build the AI provider request URL.",
        )

    body = {
        "model": model.upstream_model_id,
        "messages": [
            {
                "role": "user",
                "content": "Call the ping tool with no arguments.",
            }
        ],
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "ping",
                    "description": "Reports that the model can call tools.",
                    "parameters": {"type": "object", "properties": {}},
                },
            }
        ],
        "tool_choice": "auto",
    }

    try:
        data = _provider_post_json(
            request_config.url, request_config.headers, body, timeout=30
        )
    except ProviderError as exc:
        # A provider that rejects the request outright does not support tools,
        # but billing/auth problems must not change the metadata.
        message = exc.message
        if "tool" in message.lower():
            model.supports_tools = False
            db.commit()
            db.refresh(model)
            return ModelToolCheckResponse(
                model=_model_out(model),
                supported=False,
                message=(
                    f"{provider.label} rejected the tool-calling probe for "
                    f"{model.display_name}: {message}"
                ),
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=message
        ) from exc

    choices = data.get("choices") if isinstance(data, dict) else None
    message = (choices[0] or {}).get("message") if choices else None
    supported = bool(message and message.get("tool_calls"))

    model.supports_tools = supported
    if supported:
        model.supports_streaming = (
            model.supports_streaming
            if model.supports_streaming is not None
            else True
        )
    db.commit()
    db.refresh(model)

    return ModelToolCheckResponse(
        model=_model_out(model),
        supported=supported,
        message=(
            f"{model.display_name} called the tool successfully."
            if supported
            else (
                f"{model.display_name} answered without calling the tool, so it "
                "cannot be used for calendar actions."
            )
        ),
    )


# --- Centralized resolution ---

@dataclass(frozen=True)
class RuntimeConfig:
    """Fully resolved configuration including the secret, for server-side use.

    Never serialize this directly to a client. Use ``get_effective_config`` for
    the secret-free representation.

    Precedence (first match wins):
    1. ``conversation`` — the provider/model pinned on the conversation.
    2. ``personal``     — the user's active personal configuration.
    3. ``application``  — the administrator's default provider/model.
    """

    source: str
    provider: str
    provider_label: str
    model: str
    model_id: int
    model_label: str
    pricing_class: str
    api_key: str
    base_url: str | None
    extra: dict = field(default_factory=dict)
    credential_id: int | None = None
    model_known: bool = False
    capabilities: ModelCapabilities = field(default_factory=ModelCapabilities)


def _selection_error(source: str, model: ProviderModel | None, upstream: str) -> HTTPException:
    """Build the error for a conversation/model that can no longer be used."""
    if model is None:
        detail = (
            f"The selected model '{upstream}' is no longer in the catalogue. "
            "Choose another model."
        )
    else:
        detail = (
            f"{model.display_name} ({model.upstream_model_id}) is disabled. "
            "Choose another model."
        )
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def resolve_runtime_config(
    db: Session,
    user_id: int,
    *,
    conversation=None,
) -> RuntimeConfig:
    """Resolve the provider, credential and model for a request.

    A broken or unavailable selection is reported as an error; Halgheh never
    falls back to a different model on its own.
    """
    app_config = get_app_ai_config()
    active = repository.get_active_for_user(db, user_id)

    conversation_provider = getattr(conversation, "provider", None)
    conversation_model = getattr(conversation, "model", None)

    if conversation_provider and conversation_model:
        source = "conversation"
        provider_id = conversation_provider
        upstream = conversation_model
    elif active is not None:
        source = "personal"
        provider_id = active.provider
        upstream = active.model
    else:
        source = "application"
        provider_id = app_config.provider
        upstream = app_config.model

    provider = get_provider(provider_id)
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                f"The selected AI provider '{provider_id}' is no longer "
                "supported. Choose a provider in AI settings."
            ),
        )

    model = find_model(db, provider.id, upstream)
    if model is None or not model.enabled:
        if source == "conversation":
            raise _selection_error(source, model, upstream)
        if source == "personal":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Your personal configuration uses '{upstream}', which is "
                    f"not available in the {provider.label} catalogue. Choose a "
                    "model in AI settings."
                ),
            )
        # Application default: fall back to the provider's seed model, but only
        # if that model is itself selectable.
        fallback = find_model(db, provider.id, provider.default_model)
        if fallback is None or not fallback.enabled:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    f"The application default model '{upstream}' is not "
                    f"available in the {provider.label} catalogue."
                ),
            )
        model = fallback
        upstream = fallback.upstream_model_id

    credential = active if (active is not None and active.provider == provider.id) else None
    if credential is not None:
        try:
            api_key = decrypt_secret(credential.api_key_encrypted)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Your saved AI credential could not be decrypted. "
                    "Update or remove it in AI settings."
                ),
            )
        base_url = (
            credential.base_url
            or app_config.base_url
            or provider.default_base_url
        )
        extra = credential.extra_config or {}
        credential_id = credential.id
    elif app_config.provider == provider.id:
        api_key = app_config.api_key
        base_url = app_config.base_url or provider.default_base_url
        extra = app_config.extra
        credential_id = None
    else:
        api_key = ""
        base_url = provider.default_base_url
        extra = {}
        credential_id = None

    return RuntimeConfig(
        source=source,
        provider=provider.id,
        provider_label=provider.label,
        model=model.upstream_model_id,
        model_id=model.id,
        model_label=model.display_name,
        pricing_class=model.pricing_class,
        api_key=api_key,
        base_url=base_url,
        extra=extra,
        credential_id=credential_id,
        model_known=True,
        capabilities=capabilities_of(model),
    )


def get_effective_config(db: Session, user_id: int) -> EffectiveConfigResponse:
    config = resolve_runtime_config(db, user_id)
    return EffectiveConfigResponse(
        source=config.source,  # type: ignore[arg-type]
        provider=config.provider,
        provider_label=config.provider_label,
        model=config.model,
        model_id=config.model_id,
        model_label=config.model_label,
        pricing_class=config.pricing_class,
        base_url=config.base_url,
        has_credentials=bool(config.api_key),
        credential_id=config.credential_id,
        model_known=config.model_known,
        capabilities=_caps_out(config.capabilities),
    )


# --- Provider request tracking and diagnostics ---

def _classify_provider_error(
    *,
    http_status: int | None = None,
    provider_error_code: str | None = None,
    provider_error_message: str | None = None,
) -> ClassifiedError:
    """Classify a provider error using the centralized error classification system."""
    return classify_error(
        http_status=http_status,
        provider_error_code=provider_error_code,
        provider_error_message=provider_error_message,
    )


# --- Health and circuit breaker state ---

# In-memory circuit breaker state per provider (in production, use Redis or DB)
_circuit_breakers: dict[str, dict] = {}


def _get_circuit_breaker(provider_id: str) -> dict:
    """Get or create a circuit breaker state for a provider."""
    if provider_id not in _circuit_breakers:
        _circuit_breakers[provider_id] = {
            "state": "healthy",  # healthy, degraded, unavailable, recovering
            "consecutive_failures": 0,
            "last_failure_at": None,
            "failure_rate": 0.0,
            "last_successful_request": None,
            "total_requests": 0,
            "failed_requests": 0,
        }
    return _circuit_breakers[provider_id]


def _check_circuit_breaker(provider_id: str) -> bool:
    """Check if the circuit breaker is open for this provider.

    Returns True if requests should be blocked (circuit is open).
    """
    cb = _get_circuit_breaker(provider_id)
    if cb["state"] == "unavailable":
        if cb["consecutive_failures"] >= 5:
            return True  # Block requests
    return False


def _reset_circuit_breaker(provider_id: str) -> None:
    """Reset the circuit breaker for a provider (e.g., after admin intervention)."""
    if provider_id in _circuit_breakers:
        _circuit_breakers[provider_id] = {
            "state": "healthy",
            "consecutive_failures": 0,
            "last_failure_at": None,
            "failure_rate": 0.0,
            "last_successful_request": None,
            "total_requests": 0,
            "failed_requests": 0,
        }


# --- Endpoint: Check provider connection ---

def check_provider_connection(
    db: Session,
    user_id: int,
    provider_id: str,
    *,
    model_id: int | None = None,
) -> ConnectionCheckResponse:
    """Check if a provider is reachable and authenticated.

    Makes a minimal provider request and reports whether the provider is
    reachable and authenticated. Does not create a conversation message or
    execute agent tools. Optionally probes a specific catalogue model.
    """
    provider = get_provider((provider_id or "").strip().lower())
    if provider is None:
        return ConnectionCheckResponse(
            provider=provider_id,
            reachable=False,
            authenticated=False,
            status="unknown_provider",
            message=f"Provider '{provider_id}' is not configured.",
        )

    try:
        config = resolve_runtime_config(db, user_id)
    except HTTPException as exc:
        return ConnectionCheckResponse(
            provider=provider_id,
            reachable=True,
            authenticated=False,
            status="configuration_error",
            message=str(exc.detail),
        )
    except Exception:
        config = None

    if config is None or not config.api_key:
        return ConnectionCheckResponse(
            provider=provider_id,
            reachable=True,
            authenticated=False,
            status="no_credentials",
            message="Provider is reachable but no API key is configured.",
        )

    model = provider.default_model
    if model_id is not None:
        record = repository.get_model(db, model_id)
        if record is not None and record.provider_id == provider.id:
            model = record.upstream_model_id
    elif config.provider == provider.id:
        model = config.model

    try:
        request_config = build_request_config(
            provider=provider,
            base_url=config.base_url,
            api_key=config.api_key,
            model=model,
            extra=config.extra or {},
        )

        if not request_config.url:
            return ConnectionCheckResponse(
                provider=provider_id,
                reachable=False,
                authenticated=False,
                status="no_url",
                message="Could not build request URL for the provider.",
            )

        body = {
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
        }

        _provider_post_json(
            request_config.url,
            request_config.headers,
            body,
            timeout=10,
        )

        return ConnectionCheckResponse(
            provider=provider_id,
            reachable=True,
            authenticated=True,
            status="healthy",
            message="Provider connection successful.",
            model=model,
        )

    except ProviderError as exc:
        classified = exc.classified or _classify_provider_error(
            provider_error_message=exc.message
        )
        return ConnectionCheckResponse(
            provider=provider_id,
            reachable=classified.category
            in (
                ErrorCategory.CONNECTION_FAILURE,
                ErrorCategory.DNS_FAILURE,
                ErrorCategory.TIMEOUT,
            ),
            authenticated=False,
            status=classified.category.name.lower(),
            message=classified.human_message,
            model=model,
            retry_appropriate=classified.retry_appropriate,
            user_intervention_required=classified.user_intervention_required,
        )

    except Exception as exc:
        classified = _classify_provider_error(provider_error_message=str(exc))
        return ConnectionCheckResponse(
            provider=provider_id,
            reachable=classified.category
            in (
                ErrorCategory.CONNECTION_FAILURE,
                ErrorCategory.DNS_FAILURE,
                ErrorCategory.TIMEOUT,
            ),
            authenticated=False,
            status=classified.category.name.lower(),
            message=classified.human_message,
            model=model,
            retry_appropriate=classified.retry_appropriate,
            user_intervention_required=classified.user_intervention_required,
        )


# --- Endpoint: Retrieve provider health ---

def get_provider_health(provider_id: str) -> dict:
    """Get the current health status of a provider.

    Returns circuit breaker state, last success/failure, and failure rate.
    """
    cb = _get_circuit_breaker(provider_id)

    return {
        "provider": provider_id,
        "state": cb["state"],
        "consecutive_failures": cb["consecutive_failures"],
        "failure_rate": round(cb["failure_rate"], 2),
        "last_successful_request": (
            cb["last_successful_request"].isoformat()
            if cb["last_successful_request"]
            else None
        ),
        "last_failure_at": (
            cb["last_failure_at"].isoformat() if cb["last_failure_at"] else None
        ),
        "total_requests": cb["total_requests"],
        "failed_requests": cb["failed_requests"],
    }


# --- Endpoint: Retrieve recent request history ---

def get_recent_requests(
    db: Session,
    user_id: int,
    limit: int = 50,
) -> list[dict]:
    """Retrieve recent provider request history for a user.

    Returns diagnostic records with sanitized error information.
    """
    from ..agent.models import ProviderDiagnostic

    stmt = (
        select(ProviderDiagnostic)
        .where(ProviderDiagnostic.user_id == user_id)
        .order_by(ProviderDiagnostic.created_at.desc())
        .limit(limit)
    )
    rows = db.scalars(stmt).all()

    results = []
    for row in rows:
        results.append(
            {
                "request_id": row.request_id,
                "provider": row.provider,
                "model": row.model,
                "status": row.status,
                "duration_ms": row.duration_ms,
                "http_status_code": row.http_status_code,
                "provider_error_code": row.provider_error_code,
                "provider_error_message": row.provider_error_message,
                "connected": row.connected,
                "headers_received": row.headers_received,
                "streaming_started": row.streaming_started,
                "streaming_completed": row.streaming_completed,
                "connection_interrupted": row.connection_interrupted,
                "retry_attempted": row.retry_attempted,
                "final_status": row.final_status,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
        )

    return results


# --- Endpoint: Retrieve detailed diagnostic record ---

def get_diagnostic_record(
    db: Session,
    request_id: str,
) -> dict | None:
    """Retrieve the detailed diagnostic record for a specific request.

    Returns None if no record found.
    """
    from ..agent.models import ProviderDiagnostic

    stmt = select(ProviderDiagnostic).where(ProviderDiagnostic.request_id == request_id)
    row = db.scalars(stmt).first()

    if row is None:
        return None

    return {
        "request_id": row.request_id,
        "user_id": row.user_id,
        "conversation_id": row.conversation_id,
        "provider": row.provider,
        "model": row.model,
        "attempt": row.attempt,
        "status": row.status,
        "duration_ms": row.duration_ms,
        "http_status_code": row.http_status_code,
        "provider_error_code": row.provider_error_code,
        "provider_error_message": row.provider_error_message,
        "connected": row.connected,
        "headers_received": row.headers_received,
        "streaming_started": row.streaming_started,
        "streaming_completed": row.streaming_completed,
        "connection_interrupted": row.connection_interrupted,
        "retry_attempted": row.retry_attempted,
        "final_status": row.final_status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


# --- Personal configurations ---

def list_credentials(db: Session, user_id: int) -> list[AICredentialResponse]:
    return [
        _credential_response(db, credential)
        for credential in repository.list_for_user(db, user_id)
    ]


def get_credential(
    db: Session, user_id: int, credential_id: int
) -> AICredentialResponse:
    credential = repository.get_for_user(db, user_id, credential_id)
    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI provider configuration not found",
        )
    return _credential_response(db, credential)


def create_credential(
    db: Session, user_id: int, data: AICredentialCreate
) -> AICredentialResponse:
    provider = _provider_or_422(data.provider)
    model = require_selectable_model(db, provider.id, data.model)

    existing = repository.list_for_user(db, user_id)
    # The first personal configuration becomes active; later ones only when
    # explicitly requested.
    should_activate = data.activate or not existing
    if should_activate:
        repository.deactivate_all(db, user_id)

    credential = repository.create(
        db,
        user_id=user_id,
        provider=provider.id,
        model=model.upstream_model_id,
        base_url=data.base_url,
        name=data.name,
        api_key_encrypted=encrypt_secret(data.api_key),
        extra_config=data.extra_config,
        is_active=should_activate,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not save the AI provider configuration. Please try again.",
        )
    db.refresh(credential)
    return _credential_response(db, credential)


def update_credential(
    db: Session, user_id: int, credential_id: int, data: AICredentialUpdate
) -> AICredentialResponse:
    credential = repository.get_for_user(db, user_id, credential_id)
    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI provider configuration not found",
        )

    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Update body must not be empty",
        )

    provider_id = credential.provider
    if "provider" in updates and updates["provider"] is not None:
        provider_id = _provider_or_422(updates["provider"]).id
        credential.provider = provider_id

    if "model" in updates and updates["model"] is not None:
        model = require_selectable_model(db, provider_id, updates["model"])
        credential.model = model.upstream_model_id
    elif "provider" in updates and updates["provider"] is not None:
        # A provider change must keep the model valid for the new provider.
        model = require_selectable_model(db, provider_id, credential.model)

    if "base_url" in updates:
        credential.base_url = updates["base_url"]
    if "name" in updates:
        credential.name = updates["name"]
    if "extra_config" in updates:
        credential.extra_config = updates["extra_config"]
    if updates.get("api_key"):
        credential.api_key_encrypted = encrypt_secret(updates["api_key"])

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not update the AI provider configuration. Please try again.",
        )
    db.refresh(credential)
    return _credential_response(db, credential)


def delete_credential(db: Session, user_id: int, credential_id: int) -> None:
    credential = repository.get_for_user(db, user_id, credential_id)
    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI provider configuration not found",
        )
    repository.delete(db, credential)
    db.commit()


def activate_credential(
    db: Session, user_id: int, credential_id: int
) -> AICredentialResponse:
    credential = repository.get_for_user(db, user_id, credential_id)
    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI provider configuration not found",
        )
    if not credential.is_active:
        repository.deactivate_all(db, user_id)
        credential.is_active = True
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Could not activate the AI provider configuration.",
            )
        db.refresh(credential)
    return _credential_response(db, credential)


def revert_to_default(db: Session, user_id: int) -> EffectiveConfigResponse:
    repository.deactivate_all(db, user_id)
    db.commit()
    return get_effective_config(db, user_id)
