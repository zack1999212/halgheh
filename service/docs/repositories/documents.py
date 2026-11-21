from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from ..models import (
    Document,
    DocumentPermission,
    DocumentTag,
    DocumentVersion,
    PERMISSION_EDITOR,
    PERMISSION_VIEWER,
)
from ...project.models import Project, ProjectMember


def get(db: Session, document_id: int) -> Document | None:
    return db.scalars(select(Document).where(Document.id == document_id)).first()


def slug_exists(db: Session, workspace_id: int, slug: str) -> bool:
    stmt = select(
        exists().where(Document.workspace_id == workspace_id, Document.slug == slug)
    )
    return bool(db.scalar(stmt))


def get_permission_level(
    db: Session, document_id: int, user_id: int
) -> str | None:
    """Permission row of ``user_id`` on the document, if any."""
    stmt = select(DocumentPermission.permission_level).where(
        DocumentPermission.document_id == document_id,
        DocumentPermission.user_id == user_id,
    )
    return db.scalar(stmt)


def is_favorited_expr(user_id: int):
    """SQL expression: has ``user_id`` favorited the document?"""
    from ..models import DocumentFavorite

    return exists().where(
        DocumentFavorite.document_id == Document.id,
        DocumentFavorite.user_id == user_id,
    )


def list_for_user(
    db: Session,
    user_id: int,
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
    """Documents readable by ``user_id``, paired with per-user favorite state.

    Access scope: owned by the user OR granted a viewer/editor permission.
    The same conditions feed the count query so pagination totals match.
    """
    accessible_projects = (
        select(Project.id).where(Project.owner_id == user_id)
    ).union(select(ProjectMember.project_id).where(ProjectMember.user_id == user_id))

    conditions = [
        exists().where(
            DocumentPermission.document_id == Document.id,
            DocumentPermission.user_id == user_id,
            DocumentPermission.permission_level.in_(
                [PERMISSION_VIEWER, PERMISSION_EDITOR]
            ),
        )
        | (Document.owner_id == user_id)
        | (Document.project_id.in_(accessible_projects))
    ]
    if workspace_id is not None:
        conditions.append(Document.workspace_id == workspace_id)
    if project_id is not None:
        conditions.append(Document.project_id == project_id)
    else:
        # Personal document views/lists must not include project-associated documents.
        conditions.append(Document.project_id.is_(None))
    if folder_id is not None:
        conditions.append(Document.folder_id == folder_id)
    if q:
        conditions.append(Document.title.ilike(f"%{q}%"))
    if tag_id is not None:
        conditions.append(
            exists().where(
                DocumentTag.document_id == Document.id,
                DocumentTag.tag_id == tag_id,
            )
        )
    if is_favorite is not None:
        conditions.append(is_favorited_expr(user_id))
    if is_archived is not None:
        conditions.append(Document.is_archived.is_(is_archived))
    if is_deleted is not None:
        conditions.append(Document.is_deleted.is_(is_deleted))

    order = {
        "updated_desc": (Document.updated_at.desc(), Document.id.desc()),
        "updated_asc": (Document.updated_at.asc(), Document.id.asc()),
        "created_desc": (Document.created_at.desc(), Document.id.desc()),
        "created_asc": (Document.created_at.asc(), Document.id.asc()),
        "title_asc": (Document.title.asc(), Document.id.asc()),
        "title_desc": (Document.title.desc(), Document.id.desc()),
    }[sort]

    condition = conditions[0]
    for extra in conditions[1:]:
        condition = condition & extra

    total = int(
        db.scalar(select(func.count()).select_from(Document).where(condition)) or 0
    )
    favorited = is_favorited_expr(user_id)
    stmt = (
        select(Document, favorited)
        .where(condition)
        .order_by(*order)
        .limit(limit)
        .offset(offset)
    )
    items = [(row[0], bool(row[1])) for row in db.execute(stmt).all()]
    return items, total


def list_favorited_for_user(
    db: Session, user_id: int, *, limit: int, offset: int
) -> tuple[list[tuple[Document, bool]], int]:
    from ..models import DocumentFavorite

    condition = (
        DocumentFavorite.user_id == user_id,
        DocumentFavorite.document_id == Document.id,
        Document.is_deleted.is_(False),
        # Personal favorites must not include project-associated documents.
        Document.project_id.is_(None),
    )
    total = int(
        db.scalar(
            select(func.count())
            .select_from(Document)
            .join(DocumentFavorite, DocumentFavorite.document_id == Document.id)
            .where(*condition)
        )
        or 0
    )
    stmt = (
        select(Document, True)
        .join(DocumentFavorite, DocumentFavorite.document_id == Document.id)
        .where(*condition)
        .order_by(DocumentFavorite.created_at.desc(), Document.id.desc())
        .limit(limit)
        .offset(offset)
    )
    items = [(row[0], True) for row in db.execute(stmt).all()]
    return items, total


def create(
    db: Session,
    *,
    workspace_id: int,
    folder_id: int | None,
    project_id: int | None = None,
    owner_id: int,
    title: str,
    content: str,
    slug: str,
    icon: str | None,
) -> Document:
    document = Document(
        workspace_id=workspace_id,
        folder_id=folder_id,
        project_id=project_id,
        owner_id=owner_id,
        title=title,
        content=content,
        slug=slug,
        icon=icon,
    )
    db.add(document)
    return document


def add_version(
    db: Session,
    *,
    document_id: int,
    version_number: int,
    title: str,
    content: str,
    created_by: int | None,
) -> DocumentVersion:
    version = DocumentVersion(
        document_id=document_id,
        version_number=version_number,
        title=title,
        content=content,
        created_by=created_by,
    )
    db.add(version)
    return version


def max_version_number(db: Session, document_id: int) -> int:
    stmt = select(func.max(DocumentVersion.version_number)).where(
        DocumentVersion.document_id == document_id
    )
    return int(db.scalar(stmt) or 0)


def list_versions(
    db: Session, document_id: int, *, limit: int, offset: int
) -> tuple[list[DocumentVersion], int]:
    condition = DocumentVersion.document_id == document_id
    total = int(
        db.scalar(
            select(func.count()).select_from(DocumentVersion).where(condition)
        )
        or 0
    )
    stmt = (
        select(DocumentVersion)
        .where(condition)
        .order_by(DocumentVersion.version_number.desc())
        .limit(limit)
        .offset(offset)
    )
    items = list(db.scalars(stmt).all())
    return items, total


def get_version(
    db: Session, document_id: int, version_number: int
) -> DocumentVersion | None:
    stmt = select(DocumentVersion).where(
        DocumentVersion.document_id == document_id,
        DocumentVersion.version_number == version_number,
    )
    return db.scalars(stmt).first()
