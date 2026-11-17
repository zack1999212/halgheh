from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ...auth.models import User
from ..models import Document, DocumentPermission
from ..repositories import permissions as permission_repository
from ..schemas import DocumentPermissionCreate, DocumentPermissionUpdate
from . import access


def grant(
    db: Session, user: User, document: Document, data: DocumentPermissionCreate
) -> DocumentPermission:
    """Owner-only: grant viewer/editor access to another existing user."""
    if data.user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The document owner already has full access",
        )
    target_user = db.get(User, data.user_id)
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if (
        permission_repository.get_for_document_user(
            db, document.id, data.user_id
        )
        is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already has access to this document",
        )
    permission = permission_repository.create(
        db,
        document_id=document.id,
        user_id=data.user_id,
        permission_level=data.permission_level,
    )
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(permission)
    return permission


def list_permissions(
    db: Session, document: Document
) -> list[DocumentPermission]:
    return permission_repository.list_for_document(db, document.id)


def update_permission(
    db: Session,
    document: Document,
    permission_id: int,
    data: DocumentPermissionUpdate,
) -> DocumentPermission:
    permission = _owned_permission(db, document, permission_id)
    permission.permission_level = data.permission_level
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(permission)
    return permission


def revoke(db: Session, document: Document, permission_id: int) -> None:
    permission = _owned_permission(db, document, permission_id)
    permission_repository.delete(db, permission)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def _owned_permission(
    db: Session, document: Document, permission_id: int
) -> DocumentPermission:
    permission = permission_repository.get(db, permission_id)
    if permission is None or permission.document_id != document.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permission not found",
        )
    return permission
