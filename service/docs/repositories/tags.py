from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..models import DocumentTag, Tag


def get(db: Session, tag_id: int) -> Tag | None:
    return db.scalars(select(Tag).where(Tag.id == tag_id)).first()


def get_in_workspace(db: Session, tag_id: int, workspace_id: int) -> Tag | None:
    stmt = select(Tag).where(Tag.id == tag_id, Tag.workspace_id == workspace_id)
    return db.scalars(stmt).first()


def list_in_workspace(
    db: Session, workspace_id: int, *, limit: int, offset: int
) -> tuple[list[Tag], int]:
    condition = Tag.workspace_id == workspace_id
    total = int(
        db.scalar(select(func.count()).select_from(Tag).where(condition)) or 0
    )
    stmt = (
        select(Tag)
        .where(condition)
        .order_by(Tag.name.asc(), Tag.id.asc())
        .limit(limit)
        .offset(offset)
    )
    items = list(db.scalars(stmt).all())
    return items, total


def create(db: Session, *, workspace_id: int, name: str, color: str) -> Tag:
    tag = Tag(workspace_id=workspace_id, name=name, color=color)
    db.add(tag)
    return tag


def delete(db: Session, tag: Tag) -> None:
    db.delete(tag)


def get_document_tag(
    db: Session, document_id: int, tag_id: int
) -> DocumentTag | None:
    stmt = select(DocumentTag).where(
        DocumentTag.document_id == document_id, DocumentTag.tag_id == tag_id
    )
    return db.scalars(stmt).first()


def list_for_document(db: Session, document_id: int) -> list[Tag]:
    stmt = (
        select(Tag)
        .join(DocumentTag, DocumentTag.tag_id == Tag.id)
        .where(DocumentTag.document_id == document_id)
        .order_by(Tag.name.asc(), Tag.id.asc())
    )
    return list(db.scalars(stmt).all())


def attach(db: Session, *, document_id: int, tag_id: int) -> DocumentTag:
    document_tag = DocumentTag(document_id=document_id, tag_id=tag_id)
    db.add(document_tag)
    return document_tag


def detach(db: Session, *, document_id: int, tag_id: int) -> int:
    stmt = delete(DocumentTag).where(
        DocumentTag.document_id == document_id, DocumentTag.tag_id == tag_id
    )
    return int(db.execute(stmt).rowcount or 0)
