from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...auth.models import User
from ..models import Document, DocumentLink, Folder
from ..repositories import documents as document_repository
from ..repositories import links as link_repository
from ..repositories import permissions as permission_repository
from ..schemas import (
    DocumentLinkCreate,
    DocumentLinkResponse,
    DocumentGraphResponse,
    GraphEdge,
    GraphNode,
    LinkedDocumentInfo,
)
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


def _can_read_document(db: Session, user: User, document: Document) -> bool:
    if document.is_deleted:
        return False
    if document.owner_id == user.id:
        return True
    return permission_repository.readable_level(db, document.id, user.id) is not None


def _load_documents_map(
    db: Session, document_ids: set[int]
) -> dict[int, Document]:
    if not document_ids:
        return {}
    stmt = select(Document).where(Document.id.in_(document_ids))
    return {doc.id: doc for doc in db.scalars(stmt).all()}


def _load_folder_names(db: Session, folder_ids: set[int]) -> dict[int, str]:
    if not folder_ids:
        return {}
    stmt = select(Folder.id, Folder.name).where(Folder.id.in_(folder_ids))
    return {row[0]: row[1] for row in db.execute(stmt).all()}


def _linked_doc_info(
    doc: Document | None, folder_names: dict[int, str]
) -> LinkedDocumentInfo | None:
    if doc is None:
        return None
    return LinkedDocumentInfo(
        id=doc.id,
        title=doc.title,
        workspace_id=doc.workspace_id,
        folder_id=doc.folder_id,
        folder_name=folder_names.get(doc.folder_id) if doc.folder_id else None,
        is_deleted=bool(doc.is_deleted),
    )


def list_links(
    db: Session, user: User, source: Document
) -> tuple[list[DocumentLinkResponse], list[DocumentLinkResponse]]:
    outgoing, incoming = link_repository.list_for_document(db, source.id)
    all_ids: set[int] = set()
    for link in outgoing:
        all_ids.add(link.source_document_id)
        all_ids.add(link.target_document_id)
    for link in incoming:
        all_ids.add(link.source_document_id)
        all_ids.add(link.target_document_id)
    docs = _load_documents_map(db, all_ids)
    folder_ids = {
        doc.folder_id
        for doc in docs.values()
        if doc.folder_id is not None
    }
    folder_names = _load_folder_names(db, folder_ids)

    def build(link: DocumentLink) -> DocumentLinkResponse | None:
        src = docs.get(link.source_document_id)
        tgt = docs.get(link.target_document_id)
        if src is None or tgt is None:
            return None
        # Never expose inaccessible or deleted documents through links.
        if not _can_read_document(db, user, src) or not _can_read_document(db, user, tgt):
            return None
        return DocumentLinkResponse(
            id=link.id,
            source_document_id=link.source_document_id,
            target_document_id=link.target_document_id,
            link_type=link.link_type,
            created_at=link.created_at,
            source_document=_linked_doc_info(src, folder_names),
            target_document=_linked_doc_info(tgt, folder_names),
        )

    outgoing_items = [item for link in outgoing if (item := build(link)) is not None]
    incoming_items = [item for link in incoming if (item := build(link)) is not None]
    return outgoing_items, incoming_items


def get_document_graph(
    db: Session, user: User, workspace_id: int
) -> tuple[list[GraphNode], list[GraphEdge], bool]:
    """Nodes/edges for the workspace graph plus a truncation flag.

    Workspace authorization is enforced by the route (``owned_workspace``);
    here only accessible, non-deleted documents are loaded and edges are
    restricted to that set, so no cross-workspace or inaccessible document
    can appear. ``truncated`` is True when the workspace holds more
    documents than the internal page limit, so the UI can warn that the
    graph is incomplete (audit finding L2).
    """
    # Accessible, non-deleted documents in workspace.
    page_limit = 10000
    accessible_docs, total = document_repository.list_for_user(
        db,
        user.id,
        limit=page_limit,
        offset=0,
        workspace_id=workspace_id,
        is_deleted=False,
    )
    truncated = (total or 0) > page_limit
    docs = [doc for doc, _fav in accessible_docs]
    doc_ids = {doc.id for doc in docs}
    if not doc_ids:
        return [], [], truncated

    folder_ids = {doc.folder_id for doc in docs if doc.folder_id is not None}
    folder_names = _load_folder_names(db, folder_ids)

    nodes = [
        GraphNode(
            id=doc.id,
            title=doc.title,
            workspace_id=doc.workspace_id,
            folder_id=doc.folder_id,
            folder_name=folder_names.get(doc.folder_id) if doc.folder_id else None,
        )
        for doc in docs
    ]

    stmt = select(DocumentLink).where(
        DocumentLink.source_document_id.in_(doc_ids),
        DocumentLink.target_document_id.in_(doc_ids),
    )
    links = list(db.scalars(stmt).all())
    edges = [
        GraphEdge(
            id=link.id,
            source_document_id=link.source_document_id,
            target_document_id=link.target_document_id,
            link_type=link.link_type,
        )
        for link in links
    ]
    return nodes, edges, truncated


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
