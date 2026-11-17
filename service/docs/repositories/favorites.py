from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import DocumentFavorite


def get_for_document_user(
    db: Session, document_id: int, user_id: int
) -> DocumentFavorite | None:
    stmt = select(DocumentFavorite).where(
        DocumentFavorite.document_id == document_id,
        DocumentFavorite.user_id == user_id,
    )
    return db.scalars(stmt).first()


def create(
    db: Session, *, document_id: int, user_id: int
) -> DocumentFavorite:
    favorite = DocumentFavorite(document_id=document_id, user_id=user_id)
    db.add(favorite)
    return favorite


def delete(db: Session, favorite: DocumentFavorite) -> None:
    db.delete(favorite)
