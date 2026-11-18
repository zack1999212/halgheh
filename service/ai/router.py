from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..auth.models import User
from ..core.database import get_db
from . import service
from .schemas import (
    AICredentialCreate,
    AICredentialResponse,
    AICredentialUpdate,
    CatalogResponse,
    ConnectionCheckResponse,
    EffectiveConfigResponse,
    ModelCreate,
    ModelOut,
    ModelRefreshResponse,
    ModelToolCheckResponse,
    ModelUpdate,
)

router = APIRouter(prefix="/ai", tags=["ai"])


# --- Catalogue ---

@router.get("/providers", response_model=CatalogResponse)
def list_providers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_catalog(db)


@router.get("/models", response_model=list[ModelOut])
def list_models(
    provider: str | None = Query(default=None),
    enabled_only: bool = Query(default=False),
    compatible_with_agent: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List catalogue models, optionally only those an agent can run.

    The chatroom uses ``compatible_with_agent=calendar`` so only models with
    verified tool calling can be selected.
    """
    return service.list_models(
        db,
        provider,
        enabled_only=enabled_only,
        compatible_with_agent=compatible_with_agent,
    )


@router.post(
    "/providers/{provider_id}/models",
    response_model=ModelOut,
    status_code=status.HTTP_201_CREATED,
)
def create_model(
    provider_id: str,
    data: ModelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a model manually when the provider does not expose discovery."""
    return service.create_model(db, provider_id, data)


@router.post(
    "/providers/{provider_id}/models/refresh",
    response_model=ModelRefreshResponse,
)
def refresh_models(
    provider_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Refresh a provider's catalogue from its model-discovery endpoint."""
    return service.refresh_models(db, current_user.id, provider_id)


@router.patch("/models/{model_id}", response_model=ModelOut)
def update_model(
    model_id: int,
    data: ModelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_model(db, model_id, data)


@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_model(
    model_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a custom model that no configuration or conversation references."""
    service.delete_model(db, model_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/models/{model_id}/check-tools", response_model=ModelToolCheckResponse)
def check_model_tools(
    model_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify that a model can actually call tools, and store the result."""
    return service.check_model_tools(db, current_user.id, model_id)


# --- Effective configuration ---

@router.get("/config", response_model=EffectiveConfigResponse)
def get_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_effective_config(db, current_user.id)


@router.post("/revert-to-default", response_model=EffectiveConfigResponse)
def revert_to_default(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.revert_to_default(db, current_user.id)


# --- Provider health and diagnostics ---

@router.get("/health/{provider_id}")
def get_provider_health(
    provider_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current health status of a provider."""
    return service.get_provider_health(provider_id)


@router.get("/diagnostics/recent", response_model=list)
def get_recent_diagnostics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=500),
):
    """Retrieve recent provider request history for the current user."""
    return service.get_recent_requests(db, current_user.id, limit=limit)


@router.get("/diagnostics/{request_id}")
def get_diagnostic_record(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve the detailed diagnostic record for a specific request."""
    record = service.get_diagnostic_record(db, request_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Diagnostic record not found",
        )
    return record


@router.post("/diagnostics/check-connection", response_model=ConnectionCheckResponse)
def check_connection(
    provider_id: str = Query(...),
    model_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if a provider is reachable and authenticated.

    Makes a minimal provider request and reports whether the provider is
    reachable and authenticated. Does not create a conversation message or
    execute agent tools.

    Returns connection status and diagnostic information without exposing
    API keys or sensitive request data.
    """
    return service.check_provider_connection(
        db, current_user.id, provider_id, model_id=model_id
    )


# --- Personal configurations ---

@router.get("/credentials", response_model=list[AICredentialResponse])
def list_credentials(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_credentials(db, current_user.id)


@router.post(
    "/credentials",
    response_model=AICredentialResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_credential(
    data: AICredentialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_credential(db, current_user.id, data)


@router.get("/credentials/{credential_id}", response_model=AICredentialResponse)
def get_credential(
    credential_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_credential(db, current_user.id, credential_id)


@router.patch("/credentials/{credential_id}", response_model=AICredentialResponse)
def update_credential(
    credential_id: int,
    data: AICredentialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_credential(db, current_user.id, credential_id, data)


@router.delete(
    "/credentials/{credential_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_credential(
    credential_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_credential(db, current_user.id, credential_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/credentials/{credential_id}/activate",
    response_model=AICredentialResponse,
)
def activate_credential(
    credential_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.activate_credential(db, current_user.id, credential_id)
