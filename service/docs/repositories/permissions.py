from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import DocumentPermission, PERMISSION_EDITOR, PERMISSION_VIEWER


def get(db: Session, permission_id: int) -> DocumentPermission | None:
    stmt = select(DocumentPermission).where(
        DocumentPermission.id == permission_id
    )
    return db.scalars(stmt).first()


def get_for_document_user(
    db: Session, document_id: int, user_id: int
) -> DocumentPermission | None:
    stmt = select(DocumentPermission).where(
        DocumentPermission.document_id == document_id,
        DocumentPermission.user_id == user_id,
    )
    return db.scalars(stmt).first()


def readable_level(db: Session, document_id: int, user_id: int) -> str | None:
    """The user's permission level on the document, if any."""
    stmt = select(DocumentPermission.permission_level).where(
        DocumentPermission.document_id == document_id,
        DocumentPermission.user_id == user_id,
    )
    return db.scalar(stmt)


def list_for_document(
    db: Session, document_id: int
) -> list[DocumentPermission]:
    stmt = (
        select(DocumentPermission)
        .where(DocumentPermission.document_id == document_id)
        .order_by(DocumentPermission.created_at.asc(), DocumentPermission.id.asc())
    )
    return list(db.scalars(stmt).all())


def create(
    db: Session, *, document_id: int, user_id: int, permission_level: str
) -> DocumentPermission:
    permission = DocumentPermission(
        document_id=document_id,
        user_id=user_id,
        permission_level=permission_level,
    )
    db.add(permission)
    return permission


def delete(db: Session, permission: DocumentPermission) -> None:
    db.delete(permission)
