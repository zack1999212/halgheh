"""Database-backed provider model catalogue.

The catalogue row is the only authority for which upstream model identifiers may
be sent to a provider and what a model can do. Provider adapters receive a
resolved row; they never hardcode a model identifier.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from . import repository
from .models import ProviderModel
from .providers import ModelCapabilities, get_provider

# Capabilities an agent requires from the model it runs on. The Calendar Agent
# executes tools, so it needs a model with verified tool calling.
AGENT_MODEL_REQUIREMENTS: dict[str, dict[str, bool]] = {
    "calendar": {"tools": True},
}


def capabilities_of(model: ProviderModel) -> ModelCapabilities:
    """Translate catalogue columns into provider-level capability flags."""
    return ModelCapabilities(
        chat_completion=True,
        tool_calling=model.supports_tools,
        structured_tool_arguments=model.supports_tools,
    )


def is_compatible_with_agent(model: ProviderModel, agent_id: str) -> bool:
    """Whether a model may run the given agent.

    Only verified capabilities count: an unknown (NULL) tool-calling flag is not
    treated as support, so an unverified model is never silently run without the
    tools the agent depends on.
    """
    requirements = AGENT_MODEL_REQUIREMENTS.get(agent_id)
    if not requirements:
        return True
    if requirements.get("tools"):
        return model.supports_tools is True
    return True


def find_model(
    db: Session, provider_id: str, upstream_model_id: str
) -> ProviderModel | None:
    return repository.get_model_by_upstream(db, provider_id, upstream_model_id)


def require_selectable_model(
    db: Session,
    provider_id: str,
    upstream_model_id: str,
    *,
    agent_id: str | None = None,
) -> ProviderModel:
    """Resolve a model that may be used now, or raise an actionable error.

    Never substitutes a different model: a missing, disabled or incompatible
    model is reported so the caller can ask the user to choose again.
    """
    provider = get_provider((provider_id or "").strip().lower())
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown AI provider: {provider_id}",
        )

    upstream = (upstream_model_id or "").strip()
    model = find_model(db, provider.id, upstream)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"'{upstream or 'no model'}' is not in the {provider.label} model "
                "catalogue. Choose a model in AI settings."
            ),
        )
    if not model.enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{model.display_name} ({model.upstream_model_id}) is disabled. "
                "Choose another model."
            ),
        )
    if agent_id is not None and not is_compatible_with_agent(model, agent_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{model.display_name} cannot run this agent because tool calling "
                "is not enabled for it. Choose a tool-capable model."
            ),
        )
    return model
