from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..agent.models import AgentConversation
from .models import AICredential, ProviderModel


def create(
    db: Session,
    *,
    user_id: int,
    provider: str,
    model: str,
    base_url: str | None,
    name: str | None,
    api_key_encrypted: str,
    extra_config: dict[str, Any] | None,
    is_active: bool,
) -> AICredential:
    credential = AICredential(
        user_id=user_id,
        provider=provider,
        model=model,
        base_url=base_url,
        name=name,
        api_key_encrypted=api_key_encrypted,
        extra_config=extra_config,
        is_active=is_active,
    )
    db.add(credential)
    return credential


def list_for_user(db: Session, user_id: int) -> list[AICredential]:
    stmt = (
        select(AICredential)
        .where(AICredential.user_id == user_id)
        .order_by(
            AICredential.is_active.desc(),
            AICredential.created_at.desc(),
            AICredential.id.desc(),
        )
    )
    return list(db.scalars(stmt).all())


def get_for_user(
    db: Session, user_id: int, credential_id: int
) -> AICredential | None:
    stmt = select(AICredential).where(
        AICredential.id == credential_id,
        AICredential.user_id == user_id,
    )
    return db.scalars(stmt).first()


def get_active_for_user(db: Session, user_id: int) -> AICredential | None:
    stmt = select(AICredential).where(
        AICredential.user_id == user_id,
        AICredential.is_active.is_(True),
    )
    return db.scalars(stmt).first()


def deactivate_all(db: Session, user_id: int) -> list[AICredential]:
    active = list(
        db.scalars(
            select(AICredential).where(
                AICredential.user_id == user_id,
                AICredential.is_active.is_(True),
            )
        ).all()
    )
    for credential in active:
        credential.is_active = False
    return active


def delete(db: Session, credential: AICredential) -> None:
    db.delete(credential)


# --- Provider model catalogue ---

def list_models(
    db: Session,
    *,
    provider_id: str | None = None,
    enabled_only: bool = False,
) -> list[ProviderModel]:
    stmt = select(ProviderModel)
    if provider_id is not None:
        stmt = stmt.where(ProviderModel.provider_id == provider_id)
    if enabled_only:
        stmt = stmt.where(ProviderModel.enabled.is_(True))
    stmt = stmt.order_by(
        ProviderModel.provider_id.asc(),
        ProviderModel.display_name.asc(),
        ProviderModel.id.asc(),
    )
    return list(db.scalars(stmt).all())


def get_model(db: Session, model_id: int) -> ProviderModel | None:
    return db.get(ProviderModel, model_id)


def get_model_by_upstream(
    db: Session, provider_id: str, upstream_model_id: str
) -> ProviderModel | None:
    stmt = select(ProviderModel).where(
        ProviderModel.provider_id == provider_id,
        ProviderModel.upstream_model_id == upstream_model_id,
    )
    return db.scalars(stmt).first()


def create_model(
    db: Session,
    *,
    provider_id: str,
    upstream_model_id: str,
    display_name: str,
    description: str | None,
    context_window: int | None,
    max_output_tokens: int | None,
    supports_tools: bool | None,
    supports_streaming: bool | None,
    supports_vision: bool | None,
    enabled: bool,
    pricing_class: str,
    input_price_per_mtok: Any = None,
    output_price_per_mtok: Any = None,
    is_custom: bool,
) -> ProviderModel:
    model = ProviderModel(
        provider_id=provider_id,
        upstream_model_id=upstream_model_id,
        display_name=display_name,
        description=description,
        context_window=context_window,
        max_output_tokens=max_output_tokens,
        supports_tools=supports_tools,
        supports_streaming=supports_streaming,
        supports_vision=supports_vision,
        enabled=enabled,
        pricing_class=pricing_class,
        input_price_per_mtok=input_price_per_mtok,
        output_price_per_mtok=output_price_per_mtok,
        is_custom=is_custom,
    )
    db.add(model)
    return model


def delete_model(db: Session, model: ProviderModel) -> None:
    db.delete(model)


def count_model_references(
    db: Session, *, provider_id: str, upstream_model_id: str
) -> tuple[int, int]:
    """Count references from conversations and personal configurations."""
    conversations = db.scalar(
        select(func.count())
        .select_from(AgentConversation)
        .where(
            AgentConversation.provider == provider_id,
            AgentConversation.model == upstream_model_id,
        )
    )
    credentials = db.scalar(
        select(func.count())
        .select_from(AICredential)
        .where(
            AICredential.provider == provider_id,
            AICredential.model == upstream_model_id,
        )
    )
    return int(conversations or 0), int(credentials or 0)
