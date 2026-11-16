from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import repository
from .config import get_app_ai_config
from .crypto import decrypt_secret, encrypt_secret, mask_secret
from .providers import (
    ModelCapabilities,
    ProviderSpec,
    get_provider,
    list_providers,
)
from .schemas import (
    AICredentialCreate,
    AICredentialResponse,
    AICredentialUpdate,
    CatalogResponse,
    EffectiveConfigResponse,
    ModelCapabilitiesOut,
    ModelOut,
    ProviderOut,
)


def _caps_out(caps: ModelCapabilities) -> ModelCapabilitiesOut:
    return ModelCapabilitiesOut(
        chat_completion=caps.chat_completion,
        tool_calling=caps.tool_calling,
        structured_tool_arguments=caps.structured_tool_arguments,
    )


def _provider_or_422(provider_id: str) -> ProviderSpec:
    provider = get_provider((provider_id or "").strip().lower())
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown AI provider: {provider_id}",
        )
    return provider


def _credential_response(credential) -> AICredentialResponse:
    provider = get_provider(credential.provider)
    model_spec = provider.known_model(credential.model) if provider else None
    caps = model_spec.capabilities if model_spec else ModelCapabilities()

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
        base_url=credential.base_url,
        name=credential.name,
        has_credentials=bool(credential.api_key_encrypted),
        api_key_masked=masked,
        is_active=credential.is_active,
        model_known=model_spec is not None,
        capabilities=_caps_out(caps),
        created_at=credential.created_at,
        updated_at=credential.updated_at,
    )


# --- Catalogue ---


def get_catalog() -> CatalogResponse:
    providers: list[ProviderOut] = []
    for provider in list_providers():
        providers.append(
            ProviderOut(
                id=provider.id,
                label=provider.label,
                api_style=provider.api_style,
                default_base_url=provider.default_base_url,
                default_model=provider.default_model,
                supports_custom_base_url=provider.supports_custom_base_url,
                supports_manual_model=provider.supports_manual_model,
                models=[
                    ModelOut(
                        id=model.id,
                        label=model.label,
                        known=True,
                        capabilities=_caps_out(model.capabilities),
                    )
                    for model in provider.models
                ],
            )
        )
    return CatalogResponse(providers=providers)


def list_models(provider_id: str) -> list[ModelOut]:
    provider = _provider_or_422(provider_id)
    return [
        ModelOut(
            id=model.id,
            label=model.label,
            known=True,
            capabilities=_caps_out(model.capabilities),
        )
        for model in provider.models
    ]


# --- Centralized resolution ---


@dataclass(frozen=True)
class RuntimeConfig:
    """Fully resolved configuration including the secret, for server-side use.

    Never serialize this directly to a client. Use ``get_effective_config`` for
    the secret-free representation.
    """

    source: str
    provider: str
    provider_label: str
    model: str
    api_key: str
    base_url: str | None
    extra: dict = field(default_factory=dict)
    credential_id: int | None = None
    model_known: bool = False
    capabilities: ModelCapabilities = field(default_factory=ModelCapabilities)


def resolve_runtime_config(db: Session, user_id: int) -> RuntimeConfig:
    """Resolve active personal configuration first, then the application default.

    A broken personal configuration is reported as an error; it never silently
    falls back to the shared default or another user's configuration.
    """
    credential = repository.get_active_for_user(db, user_id)
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
        provider = get_provider(credential.provider)
        if provider is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Your saved AI provider is no longer supported. "
                    "Update it in AI settings."
                ),
            )
        app_config = get_app_ai_config()
        model_spec = provider.known_model(credential.model)
        return RuntimeConfig(
            source="personal",
            provider=provider.id,
            provider_label=provider.label,
            model=credential.model,
            api_key=api_key,
            base_url=credential.base_url or app_config.base_url,
            extra=credential.extra_config or {},
            credential_id=credential.id,
            model_known=model_spec is not None,
            capabilities=model_spec.capabilities if model_spec else ModelCapabilities(),
        )

    app_config = get_app_ai_config()
    provider = get_provider(app_config.provider)
    model_spec = provider.known_model(app_config.model) if provider else None
    return RuntimeConfig(
        source="application",
        provider=app_config.provider,
        provider_label=provider.label if provider else app_config.provider,
        model=app_config.model,
        api_key=app_config.api_key,
        base_url=app_config.base_url,
        extra=app_config.extra,
        credential_id=None,
        model_known=model_spec is not None,
        capabilities=model_spec.capabilities if model_spec else ModelCapabilities(),
    )


def get_effective_config(db: Session, user_id: int) -> EffectiveConfigResponse:
    config = resolve_runtime_config(db, user_id)
    return EffectiveConfigResponse(
        source=config.source,  # type: ignore[arg-type]
        provider=config.provider,
        provider_label=config.provider_label,
        model=config.model,
        base_url=config.base_url,
        has_credentials=bool(config.api_key),
        credential_id=config.credential_id,
        model_known=config.model_known,
        capabilities=_caps_out(config.capabilities),
    )


# --- Personal configuration CRUD ---


def list_credentials(db: Session, user_id: int) -> list[AICredentialResponse]:
    return [
        _credential_response(credential)
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
    return _credential_response(credential)


def create_credential(
    db: Session, user_id: int, data: AICredentialCreate
) -> AICredentialResponse:
    provider = _provider_or_422(data.provider)

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
        model=data.model,
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
    return _credential_response(credential)


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

    if "provider" in updates and updates["provider"] is not None:
        provider = _provider_or_422(updates["provider"])
        credential.provider = provider.id
    if "model" in updates and updates["model"] is not None:
        credential.model = updates["model"]
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
    return _credential_response(credential)


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
    return _credential_response(credential)


def revert_to_default(db: Session, user_id: int) -> EffectiveConfigResponse:
    repository.deactivate_all(db, user_id)
    db.commit()
    return get_effective_config(db, user_id)
