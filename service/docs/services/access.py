from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ...auth.models import User
from ..models import Document, Workspace
from ..repositories import documents as document_repository
from ..repositories import permissions as permission_repository
from ..repositories import workspaces as workspace_repository


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def owned_workspace(
    db: Session, user: User, workspace_id: int
) -> Workspace:
    """Workspace owned by ``user``; hidden as 404 otherwise."""
    workspace = workspace_repository.get(db, workspace_id)
    if workspace is None or workspace.owner_id != user.id:
        raise _not_found("Workspace not found")
    return workspace


def readable_document(db: Session, user: User, document_id: int) -> Document:
    """Document the user may read: owner, or granted viewer/editor.

    Non-readers get the same 404 as an unknown id so the existence of
    private documents is never revealed.
    """
    document = document_repository.get(db, document_id)
    if document is None:
        raise _not_found("Document not found")
    if document.owner_id == user.id:
        return document
    level = permission_repository.readable_level(db, document.id, user.id)
    if level is None:
        raise _not_found("Document not found")
    return document


def writable_document(db: Session, user: User, document_id: int) -> Document:
    """Document the user may modify: owner, or granted editor."""
    document = readable_document(db, user, document_id)
    if document.owner_id != user.id:
        level = permission_repository.readable_level(db, document.id, user.id)
        if level != "editor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to modify this document",
            )
    return document


def owner_document(db: Session, user: User, document_id: int) -> Document:
    """Document whose permission grants may be managed: owner only."""
    document = readable_document(db, user, document_id)
    if document.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the document owner can perform this action",
        )
    return document
