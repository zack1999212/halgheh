from fastapi import APIRouter, Depends, Query, Response, status
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
    EffectiveConfigResponse,
    ModelOut,
)

router = APIRouter(prefix="/ai", tags=["ai"])


# --- Catalogue ---


@router.get("/providers", response_model=CatalogResponse)
def list_providers(
    current_user: User = Depends(get_current_user),
):
    return service.get_catalog()


@router.get("/models", response_model=list[ModelOut])
def list_models(
    provider: str = Query(...),
    current_user: User = Depends(get_current_user),
):
    return service.list_models(provider)


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
