from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...auth.models import User
from ..models import Document, DocumentLink
from ..repositories import links as link_repository
from ..schemas import DocumentLinkCreate
from . import access


def create_link(
    db: Session, user: User, source: Document, data: DocumentLinkCreate
) -> DocumentLink:
    """Link a source document to a target document.

    Write access is required on BOTH sides, so users can never create
    links pointing at documents they cannot modify.
    """
    if data.target_document_id == source.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A document cannot link to itself",
        )
    target = access.writable_document(db, user, data.target_document_id)
    link = link_repository.create(
        db,
        source_document_id=source.id,
        target_document_id=target.id,
        link_type=data.link_type,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This link already exists",
        )
    except Exception:
        db.rollback()
        raise
    db.refresh(link)
    return link


def list_links(
    db: Session, source: Document
) -> tuple[list[DocumentLink], list[DocumentLink]]:
    return link_repository.list_for_document(db, source.id)


def delete_link(
    db: Session, document: Document, link_id: int
) -> None:
    """Remove a link that references ``document`` (either direction).

    Requires write access on the document in the path; the opposite side's
    link row disappears with it (documented consequence of the CASCADE FKs).
    """
    link = link_repository.get(db, link_id)
    if (
        link is None
        or (
            link.source_document_id != document.id
            and link.target_document_id != document.id
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found",
        )
    link_repository.delete(db, link)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
