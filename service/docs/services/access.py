from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ...auth.models import User
from ..models import Document, Workspace
from ..repositories import documents as document_repository
from ..repositories import permissions as permission_repository
from ..repositories import workspaces as workspace_repository
from ...project import permissions as project_permissions
from ...project import service as project_service


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


def _workspace_role_for_document(db: Session, document: Document, user_id: int) -> str | None:
    from ...workspace import repository as ws_repo
    from ...workspace import permissions as ws_permissions
    from ..models import Workspace

    ws_ids = ws_repo.get_resource_workspace_ids(db, "document", document.id)
    if not ws_ids:
        return None
    best = None
    for ws_id in ws_ids:
        ws = db.get(Workspace, ws_id)
        if ws is None:
            continue
        member = ws_repo.get_member(db, ws_id, user_id)
        resolved = ws_permissions.workspace_role(ws, user_id, member.role if member else None)
        if ws_permissions.can_view(resolved):
            if best is None or resolved == "owner" or (resolved in ("admin","editor") and best == "viewer"):
                best = resolved
    return best if best is not None else "none"


def readable_document(db: Session, user: User, document_id: int) -> Document:
    """Document the user may read through workspace membership/ownership or legacy grants."""
    document = document_repository.get(db, document_id)
    if document is None:
        raise _not_found("Document not found")
    ws_role = _workspace_role_for_document(db, document, user.id)
    if ws_role is not None:
        from ...workspace import permissions as ws_permissions
        if ws_permissions.can_view(ws_role):
            return document
        raise _not_found("Document not found")
    # legacy fallback
    if document.project_id is not None:
        project, role = project_service.require_project_view(db, user.id, document.project_id)
        if not project_permissions.can_view(role):
            raise _not_found("Document not found")
        return document
    if document.owner_id == user.id:
        return document
    level = permission_repository.readable_level(db, document.id, user.id)
    if level is None:
        raise _not_found("Document not found")
    return document


def writable_document(db: Session, user: User, document_id: int) -> Document:
    """Document the user may modify: owner, or granted editor."""
    document = readable_document(db, user, document_id)
    ws_role = _workspace_role_for_document(db, document, user.id)
    if ws_role is not None:
        from ...workspace import permissions as ws_permissions
        if not ws_permissions.can_manage_content(ws_role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to modify this document",
            )
        return document
    if document.project_id is not None:
        project, role = project_service.require_project_view(db, user.id, document.project_id)
        if not project_permissions.can_manage_project_content(role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to modify this document",
            )
        return document
    if document.owner_id != user.id:
        level = permission_repository.readable_level(db, document.id, user.id)
        if level != "editor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to modify this document",
            )
    return document


def can_modify_document(db: Session, user: User, document: Document) -> bool:
    """Return True when the user may modify the document without raising."""
    try:
        writable_document(db, user, document.id)
        return True
    except HTTPException:
        return False


def owner_document(db: Session, user: User, document_id: int) -> Document:
    """Document whose permission grants may be managed: owner only."""
    document = readable_document(db, user, document_id)
    if document.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the document owner can perform this action",
        )
    return document
