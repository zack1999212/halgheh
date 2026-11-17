"""FastAPI dependency adapters for the Document Management module.

These wrap services/access.py so routers can declare path objects directly,
e.g. ``document: Document = Depends(readable_document)``. They contain no
rules themselves — all decisions live in the service layer, so CLI jobs or
future module integrations reuse the exact same logic.
"""

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..auth.models import User
from ..core.database import get_db
from .models import Document, Folder, Tag, Workspace
from .repositories import folders as folder_repository
from .repositories import tags as tag_repository
from .repositories import workspaces as workspace_repository
from .services import access


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def owned_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Workspace:
    return access.owned_workspace(db, current_user, workspace_id)


def readable_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    return access.readable_document(db, current_user, document_id)


def writable_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    return access.writable_document(db, current_user, document_id)


def owned_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    return access.owner_document(db, current_user, document_id)


def owned_folder(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Folder:
    """Folder in a workspace owned by the current user (hidden otherwise)."""
    folder = folder_repository.get(db, folder_id)
    if folder is None:
        raise _not_found("Folder not found")
    workspace = workspace_repository.get(db, folder.workspace_id)
    if workspace is None or workspace.owner_id != current_user.id:
        raise _not_found("Folder not found")
    return folder


def owned_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Tag:
    tag = tag_repository.get(db, tag_id)
    if tag is None:
        raise _not_found("Tag not found")
    workspace = workspace_repository.get(db, tag.workspace_id)
    if workspace is None or workspace.owner_id != current_user.id:
        raise _not_found("Tag not found")
    return tag
