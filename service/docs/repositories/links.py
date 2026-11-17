from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import DocumentLink


def get(db: Session, link_id: int) -> DocumentLink | None:
    return db.scalars(select(DocumentLink).where(DocumentLink.id == link_id)).first()


def list_for_document(
    db: Session, document_id: int
) -> tuple[list[DocumentLink], list[DocumentLink]]:
    stmt = (
        select(DocumentLink)
        .where(DocumentLink.source_document_id == document_id)
        .order_by(DocumentLink.created_at.desc(), DocumentLink.id.desc())
    )
    outgoing = list(db.scalars(stmt).all())
    stmt = (
        select(DocumentLink)
        .where(DocumentLink.target_document_id == document_id)
        .order_by(DocumentLink.created_at.desc(), DocumentLink.id.desc())
    )
    incoming = list(db.scalars(stmt).all())
    return outgoing, incoming


def create(
    db: Session,
    *,
    source_document_id: int,
    target_document_id: int,
    link_type: str,
) -> DocumentLink:
    link = DocumentLink(
        source_document_id=source_document_id,
        target_document_id=target_document_id,
        link_type=link_type,
    )
    db.add(link)
    return link


def delete(db: Session, link: DocumentLink) -> None:
    db.delete(link)
