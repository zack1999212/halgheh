from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...auth.models import User
from ..models import Document, Tag
from ..repositories import tags as tag_repository
from ..schemas import TagCreate, TagUpdate
from . import access


def create_tag(db: Session, user: User, data: TagCreate) -> Tag:
    access.owned_workspace(db, user, data.workspace_id)
    tag = tag_repository.create(
        db, workspace_id=data.workspace_id, name=data.name, color=data.color
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A tag with this name already exists in this workspace",
        )
    except Exception:
        db.rollback()
        raise
    db.refresh(tag)
    return tag


def update_tag(db: Session, tag: Tag, data: TagUpdate) -> Tag:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tag, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A tag with this name already exists in this workspace",
        )
    except Exception:
        db.rollback()
        raise
    db.refresh(tag)
    return tag


def delete_tag(db: Session, tag: Tag) -> None:
    # CASCADE removes the tag's document_tags rows (see models).
    tag_repository.delete(db, tag)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def list_tags(
    db: Session, user: User, workspace_id: int, *, limit: int, offset: int
) -> tuple[list[Tag], int]:
    access.owned_workspace(db, user, workspace_id)
    return tag_repository.list_in_workspace(
        db, workspace_id, limit=limit, offset=offset
    )


def list_document_tags(
    db: Session, document: Document
) -> list[Tag]:
    return tag_repository.list_for_document(db, document.id)


def attach_tag(
    db: Session, user: User, document: Document, tag_id: int
) -> Tag:
    """Attach an existing workspace tag to a document.

    Requires write access on the document; the tag must belong to the
    same workspace as the document.
    """
    tag = tag_repository.get(db, tag_id)
    if tag is None or tag.workspace_id != document.workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found",
        )
    if tag_repository.get_document_tag(db, document.id, tag.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tag is already attached to this document",
        )
    tag_repository.attach(db, document_id=document.id, tag_id=tag.id)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return tag


def detach_tag(
    db: Session, document: Document, tag_id: int
) -> None:
    removed = tag_repository.detach(
        db, document_id=document.id, tag_id=tag_id
    )
    if removed == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag is not attached to this document",
        )
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
