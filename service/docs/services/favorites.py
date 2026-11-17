from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...auth.models import User
from ..models import Document, DocumentFavorite
from ..repositories import documents as document_repository
from ..repositories import favorites as favorite_repository
from . import access


def add_favorite(
    db: Session, user: User, document: Document
) -> DocumentFavorite:
    """Any user with read access can favorite a document for themselves.

    For the owner this also flips the denormalized ``documents.is_favorite``
    flag (see the model docstring); other users' favorites never touch it.
    """
    favorite = favorite_repository.get_for_document_user(
        db, document.id, user.id
    )
    if favorite is None:
        favorite = favorite_repository.create(
            db, document_id=document.id, user_id=user.id
        )
    if document.owner_id == user.id and not document.is_favorite:
        document.is_favorite = True
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        favorite = favorite_repository.get_for_document_user(
            db, document.id, user.id
        )
        if favorite is None:
            raise
    except Exception:
        db.rollback()
        raise
    db.refresh(favorite)
    return favorite


def remove_favorite(db: Session, user: User, document: Document) -> None:
    favorite = favorite_repository.get_for_document_user(
        db, document.id, user.id
    )
    if favorite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document is not favorited",
        )
    favorite_repository.delete(db, favorite)
    if document.owner_id == user.id:
        document.is_favorite = False
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def list_favorites(
    db: Session, user: User, *, limit: int, offset: int
) -> tuple[list[tuple[Document, bool]], int]:
    """Documents favorited by ``user`` (trash excluded), newest first."""
    return document_repository.list_favorited_for_user(
        db, user.id, limit=limit, offset=offset
    )
