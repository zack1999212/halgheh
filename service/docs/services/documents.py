import re

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...auth.models import User
from ..models import Document, Folder, Tag
from ..repositories import documents as document_repository
from ..repositories import favorites as favorite_repository
from ..repositories import folders as folder_repository
from ..repositories import tags as tag_repository
from ..schemas import DocumentCreate, DocumentUpdate
from . import access
from . import wiki as wiki_service
from ...project import service as project_service

# Keep room for the "-2", "-3"... disambiguation suffixes.
MAX_SLUG_LENGTH = 240


def _slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug[:MAX_SLUG_LENGTH] or "document"


def _unique_slug(db: Session, workspace_id: int, title: str) -> str:
    """Slugs are unique per workspace (uq_documents_workspace_slug)."""
    base = _slugify(title)
    candidate = base
    suffix = 2
    while document_repository.slug_exists(db, workspace_id, candidate):
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def create_document(db: Session, user: User, data: DocumentCreate) -> Document:
    # Only the workspace owner creates documents; the owner is the
    # authenticated user, never a client-supplied field.
    access.owned_workspace(db, user, data.workspace_id)
    if data.folder_id is not None:
        folder = folder_repository.get_in_workspace(
            db, data.folder_id, data.workspace_id
        )
        if folder is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found",
            )
    project_id = getattr(data, "project_id", None)
    if project_id is not None:
        project_service.require_project_manage(db, user.id, project_id)
    document = document_repository.create(
        db,
        workspace_id=data.workspace_id,
        folder_id=data.folder_id,
        project_id=project_id,
        owner_id=user.id,
        title=data.title,
        content=data.content,
        slug=_unique_slug(db, data.workspace_id, data.title),
        icon=data.icon,
    )
    try:
        # flush() assigns document.id and trips the slug unique constraint
        # before the version snapshot is written, so both succeed or
        # neither does.
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document slug conflict, please retry",
        )
    document_repository.add_version(
        db,
        document_id=document.id,
        version_number=1,
        title=document.title,
        content=document.content,
        created_by=user.id,
    )
    wiki_service.sync_wiki_reference_links(db, user, document)
    try:
        db.commit()
    except IntegrityError:
        # Unique-constraint races (slug or wiki link) that slipped past the
        # earlier flush: report a conflict instead of a generic 500, matching
        # the update/link paths' error conventions.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document already exists, please retry",
        )
    except Exception:
        db.rollback()
        raise
    db.refresh(document)
    return document


def update_document(
    db: Session, user: User, document: Document, data: DocumentUpdate
) -> Document:
    """Metadata changes update the row; content/title changes also snapshot
    a new immutable version created by ``user``. Slugs stay stable across
    renames so links to a document never break."""
    updates = data.model_dump(exclude_unset=True)
    if "project_id" in updates:
        new_project_id = updates.pop("project_id")
        if document.project_id is not None:
            project_service.require_project_manage(db, user.id, document.project_id)
        if new_project_id is not None:
            project_service.require_project_manage(db, user.id, new_project_id)
        if document.project_id is None and document.owner_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the document owner can perform this action",
            )
        document.project_id = new_project_id
    if "folder_id" in updates and updates["folder_id"] is not None:
        folder = folder_repository.get_in_workspace(
            db, updates["folder_id"], document.workspace_id
        )
        if folder is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found",
            )
    content_changed = "content" in updates and updates["content"] != document.content
    title_changed = "title" in updates and updates["title"] != document.title
    for field, value in updates.items():
        setattr(document, field, value)
    if content_changed or title_changed:
        document_repository.add_version(
            db,
            document_id=document.id,
            version_number=document_repository.max_version_number(db, document.id) + 1,
            title=document.title,
            content=document.content,
            created_by=user.id,
        )
    if content_changed:
        wiki_service.sync_wiki_reference_links(db, user, document)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(document)
    return document


def trash_document(db: Session, document: Document) -> None:
    """Soft delete: row and history stay intact and restorable."""
    document.is_deleted = True
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def restore_document(db: Session, document: Document) -> Document:
    document.is_deleted = False
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(document)
    return document


def list_documents(
    db: Session,
    user: User,
    *,
    limit: int,
    offset: int,
    workspace_id: int | None = None,
    project_id: int | None = None,
    folder_id: int | None = None,
    q: str | None = None,
    tag_id: int | None = None,
    is_favorite: bool | None = None,
    is_archived: bool | None = None,
    is_deleted: bool | None = False,
    sort: str = "updated_desc",
) -> tuple[list[tuple[Document, bool]], int]:
    """(document, favorited_by_user) pairs plus the unfiltered total."""
    return document_repository.list_for_user(
        db,
        user.id,
        limit=limit,
        offset=offset,
        workspace_id=workspace_id,
        project_id=project_id,
        folder_id=folder_id,
        q=q,
        tag_id=tag_id,
        is_favorite=is_favorite,
        is_archived=is_archived,
        is_deleted=is_deleted,
        sort=sort,
    )


def get_document(
    db: Session, user: User, document_id: int
) -> tuple[Document, bool, list[Tag], Folder | None]:
    """Detail read: (document, favorited_by_user, tags, folder).

    Only readable by the owner or granted users (access.readable_document);
    unreadable documents raise the same 404 as unknown ids.
    """
    document = access.readable_document(db, user, document_id)
    favorited = (
        favorite_repository.get_for_document_user(db, document.id, user.id)
        is not None
    )
    tags = tag_repository.list_for_document(db, document.id)
    folder = (
        folder_repository.get(db, document.folder_id)
        if document.folder_id is not None
        else None
    )
    return document, favorited, tags, folder


def list_versions(
    db: Session, document: Document, *, limit: int, offset: int
) -> tuple[list, int]:
    return document_repository.list_versions(
        db, document.id, limit=limit, offset=offset
    )


def get_version(
    db: Session, document: Document, version_number: int
):
    version = document_repository.get_version(
        db, document.id, version_number
    )
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document version not found",
        )
    return version
