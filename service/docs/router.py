"""HTTP layer for the Document Management module.

Routes are thin adapters: they validate input (Pydantic schemas, Query
constraints), resolve path objects through dependencies.py, delegate to
services, and map results to response schemas. Versioned under
/documents/v1 so future integrations can rely on a stable contract.

Route registration order matters: static paths (``/favorites``) are
declared before parameterized ones (``/documents/{document_id}``).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..auth.models import User
from ..core.database import get_db
from . import dependencies as deps
from .models import Document, Folder, Tag, Workspace
from .schemas import (
    DocumentCreate,
    DocumentDetailResponse,
    DocumentFavoriteResponse,
    DocumentLinkCreate,
    DocumentLinkResponse,
    DocumentLinksResponse,
    DocumentListResponse,
    DocumentPermissionCreate,
    DocumentPermissionResponse,
    DocumentPermissionUpdate,
    DocumentResponse,
    DocumentSort,
    DocumentUpdate,
    DocumentVersionListResponse,
    DocumentVersionResponse,
    FolderCreate,
    FolderListResponse,
    FolderNode,
    FolderResponse,
    FolderTreeResponse,
    FolderUpdate,
    TagCreate,
    TagListResponse,
    TagResponse,
    TagUpdate,
    WorkspaceCreate,
    WorkspaceListResponse,
    WorkspaceResponse,
    WorkspaceUpdate,
)
from .services import documents as document_service
from .services import favorites as favorite_service
from .services import folders as folder_service
from .services import links as link_service
from .services import permissions as permission_service
from .services import tags as tag_service
from .services import workspaces as workspace_service

router = APIRouter(prefix="/documents/v1", tags=["documents"])

# Shared pagination constraints (matches the plan's 50/200 defaults).
Limit = Annotated[int, Query(ge=1, le=200)]
Offset = Annotated[int, Query(ge=0)]

# 204 responses need an explicit empty body marker.
_no_content = Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- workspaces


@router.post("/workspaces", status_code=201, response_model=WorkspaceResponse)
def create_workspace(
    data: WorkspaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return workspace_service.create_workspace(db, current_user, data)


@router.get("/workspaces", response_model=WorkspaceListResponse)
def list_workspaces(
    limit: Limit = 50,
    offset: Offset = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = workspace_service.list_workspaces(
        db, current_user, limit=limit, offset=offset
    )
    return WorkspaceListResponse(
        items=items, total=total, limit=limit, offset=offset
    )


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceResponse)
def get_workspace(workspace: Workspace = Depends(deps.owned_workspace)):
    return workspace


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceResponse)
def update_workspace(
    data: WorkspaceUpdate,
    db: Session = Depends(get_db),
    workspace: Workspace = Depends(deps.owned_workspace),
):
    return workspace_service.update_workspace(db, workspace, data)


@router.delete("/workspaces/{workspace_id}", status_code=204)
def delete_workspace(
    db: Session = Depends(get_db),
    workspace: Workspace = Depends(deps.owned_workspace),
):
    workspace_service.delete_workspace(db, workspace)
    return _no_content


# ------------------------------------------------------------------- folders


@router.post("/folders", status_code=201, response_model=FolderResponse)
def create_folder(
    data: FolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return folder_service.create_folder(db, current_user, data)


@router.get("/folders", response_model=FolderListResponse)
def list_folders(
    limit: Limit = 50,
    offset: Offset = 0,
    workspace_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = folder_service.list_folders(
        db, current_user, workspace_id, limit=limit, offset=offset
    )
    return FolderListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/folders/tree", response_model=FolderTreeResponse)
def get_folder_tree(
    workspace_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full folder hierarchy of the workspace (owner-only), roots first.

    No pagination: a tree must be returned complete to remain consistent.
    ``total`` counts every folder in the workspace.
    """
    items, total = folder_service.get_folder_tree(
        db, current_user, workspace_id
    )
    return FolderTreeResponse(items=items, total=total)


@router.patch("/folders/{folder_id}", response_model=FolderResponse)
def update_folder(
    data: FolderUpdate,
    db: Session = Depends(get_db),
    folder: Folder = Depends(deps.owned_folder),
):
    return folder_service.update_folder(db, folder, data)


@router.delete("/folders/{folder_id}", status_code=204)
def delete_folder(
    db: Session = Depends(get_db),
    folder: Folder = Depends(deps.owned_folder),
):
    folder_service.delete_folder(db, folder)
    return _no_content


# ---------------------------------------------------------------------- tags


@router.post("/tags", status_code=201, response_model=TagResponse)
def create_tag(
    data: TagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return tag_service.create_tag(db, current_user, data)


@router.get("/tags", response_model=TagListResponse)
def list_tags(
    limit: Limit = 50,
    offset: Offset = 0,
    workspace_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = tag_service.list_tags(
        db, current_user, workspace_id, limit=limit, offset=offset
    )
    return TagListResponse(items=items, total=total, limit=limit, offset=offset)


@router.patch("/tags/{tag_id}", response_model=TagResponse)
def update_tag(
    data: TagUpdate,
    db: Session = Depends(get_db),
    tag: Tag = Depends(deps.owned_tag),
):
    return tag_service.update_tag(db, tag, data)


@router.delete("/tags/{tag_id}", status_code=204)
def delete_tag(
    db: Session = Depends(get_db),
    tag: Tag = Depends(deps.owned_tag),
):
    tag_service.delete_tag(db, tag)
    return _no_content


# ----------------------------------------------------------------- documents


@router.post("/documents", status_code=201, response_model=DocumentResponse)
def create_document(
    data: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = document_service.create_document(db, current_user, data)
    return _document_response(document, favorited=False)


# Declared before /documents/{document_id} so "favorites" is not captured
# as a document id.
@router.get("/favorites", response_model=DocumentListResponse)
def list_favorites(
    limit: Limit = 50,
    offset: Offset = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = favorite_service.list_favorites(
        db, current_user, limit=limit, offset=offset
    )
    return DocumentListResponse(
        items=[_document_response(d, f) for d, f in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/documents", response_model=DocumentListResponse)
def list_documents(
    limit: Limit = 50,
    offset: Offset = 0,
    workspace_id: int | None = Query(default=None),
    folder_id: int | None = Query(default=None),
    q: str | None = Query(default=None, max_length=256),
    tag_id: int | None = Query(default=None),
    is_favorite: bool | None = Query(default=None),
    is_archived: bool | None = Query(default=None),
    is_deleted: bool | None = Query(default=False),
    sort: DocumentSort = Query(default="updated_desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = document_service.list_documents(
        db,
        current_user,
        limit=limit,
        offset=offset,
        workspace_id=workspace_id,
        folder_id=folder_id,
        q=q,
        tag_id=tag_id,
        is_favorite=is_favorite,
        is_archived=is_archived,
        is_deleted=is_deleted,
        sort=sort,
    )
    return DocumentListResponse(
        items=[_document_response(d, f) for d, f in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/documents/{document_id}", response_model=DocumentDetailResponse)
def get_document(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    document: Document = Depends(deps.readable_document),
):
    _, favorited, tags, folder = document_service.get_document(
        db, current_user, document.id
    )
    response = DocumentDetailResponse.model_validate(document)
    # Per-user favorite state; the row's flag is the owner's denormalized
    # copy and must not leak to other users.
    response.is_favorite = favorited
    response.folder = folder
    response.tags = tags
    return response


@router.patch("/documents/{document_id}", response_model=DocumentResponse)
def update_document(
    data: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    document: Document = Depends(deps.writable_document),
):
    updated = document_service.update_document(db, current_user, document, data)
    return _document_response(
        updated, _is_favorited(db, current_user, document.id)
    )


@router.delete("/documents/{document_id}", status_code=204)
def trash_document(
    db: Session = Depends(get_db),
    document: Document = Depends(deps.writable_document),
):
    document_service.trash_document(db, document)
    return _no_content


@router.post(
    "/documents/{document_id}/restore", response_model=DocumentResponse
)
def restore_document(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    document: Document = Depends(deps.writable_document),
):
    restored = document_service.restore_document(db, document)
    return _document_response(
        restored, _is_favorited(db, current_user, document.id)
    )


# ------------------------------------------------------------------ versions


@router.get(
    "/documents/{document_id}/versions",
    response_model=DocumentVersionListResponse,
)
def list_document_versions(
    limit: Limit = 50,
    offset: Offset = 0,
    db: Session = Depends(get_db),
    document: Document = Depends(deps.readable_document),
):
    items, total = document_service.list_versions(
        db, document, limit=limit, offset=offset
    )
    return DocumentVersionListResponse(
        items=items, total=total, limit=limit, offset=offset
    )


@router.get(
    "/documents/{document_id}/versions/{version_number}",
    response_model=DocumentVersionResponse,
)
def get_document_version(
    version_number: int,
    db: Session = Depends(get_db),
    document: Document = Depends(deps.readable_document),
):
    return document_service.get_version(db, document, version_number)


# ----------------------------------------------------------------------- tags


@router.get(
    "/documents/{document_id}/tags", response_model=list[TagResponse]
)
def list_document_tags(
    db: Session = Depends(get_db),
    document: Document = Depends(deps.readable_document),
):
    return tag_service.list_document_tags(db, document)


@router.post(
    "/documents/{document_id}/tags",
    status_code=201,
    response_model=TagResponse,
)
def attach_document_tag(
    tag_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    document: Document = Depends(deps.writable_document),
):
    return tag_service.attach_tag(db, current_user, document, tag_id)


@router.delete("/documents/{document_id}/tags/{tag_id}", status_code=204)
def detach_document_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    document: Document = Depends(deps.writable_document),
):
    tag_service.detach_tag(db, document, tag_id)
    return _no_content


# ------------------------------------------------------------------ favorites


@router.post(
    "/documents/{document_id}/favorite",
    status_code=201,
    response_model=DocumentFavoriteResponse,
)
def add_document_favorite(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    document: Document = Depends(deps.readable_document),
):
    return favorite_service.add_favorite(db, current_user, document)


@router.delete("/documents/{document_id}/favorite", status_code=204)
def remove_document_favorite(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    document: Document = Depends(deps.readable_document),
):
    favorite_service.remove_favorite(db, current_user, document)
    return _no_content


# --------------------------------------------------------------------- links


@router.post(
    "/documents/{document_id}/links",
    status_code=201,
    response_model=DocumentLinkResponse,
)
def create_document_link(
    data: DocumentLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    source: Document = Depends(deps.writable_document),
):
    return link_service.create_link(db, current_user, source, data)


@router.get(
    "/documents/{document_id}/links", response_model=DocumentLinksResponse
)
def list_document_links(
    db: Session = Depends(get_db),
    source: Document = Depends(deps.readable_document),
):
    outgoing, incoming = link_service.list_links(db, source)
    return DocumentLinksResponse(outgoing=outgoing, incoming=incoming)


@router.delete(
    "/documents/{document_id}/links/{link_id}", status_code=204
)
def delete_document_link(
    link_id: int,
    db: Session = Depends(get_db),
    document: Document = Depends(deps.writable_document),
):
    link_service.delete_link(db, document, link_id)
    return _no_content


# ---------------------------------------------------------------- permissions


@router.post(
    "/documents/{document_id}/permissions",
    status_code=201,
    response_model=DocumentPermissionResponse,
)
def grant_document_permission(
    data: DocumentPermissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    document: Document = Depends(deps.owned_document),
):
    return permission_service.grant(db, current_user, document, data)


@router.get(
    "/documents/{document_id}/permissions",
    response_model=list[DocumentPermissionResponse],
)
def list_document_permissions(
    db: Session = Depends(get_db),
    document: Document = Depends(deps.owned_document),
):
    return permission_service.list_permissions(db, document)


@router.patch(
    "/documents/{document_id}/permissions/{permission_id}",
    response_model=DocumentPermissionResponse,
)
def update_document_permission(
    data: DocumentPermissionUpdate,
    permission_id: int,
    db: Session = Depends(get_db),
    document: Document = Depends(deps.owned_document),
):
    return permission_service.update_permission(
        db, document, permission_id, data
    )


@router.delete(
    "/documents/{document_id}/permissions/{permission_id}",
    status_code=204,
)
def revoke_document_permission(
    permission_id: int,
    db: Session = Depends(get_db),
    document: Document = Depends(deps.owned_document),
):
    permission_service.revoke(db, document, permission_id)
    return _no_content


# ------------------------------------------------------------------- helpers


def _is_favorited(db: Session, user: User, document_id: int) -> bool:
    from .repositories import favorites as favorite_repository

    return (
        favorite_repository.get_for_document_user(db, document_id, user.id)
        is not None
    )


def _document_response(document, favorited: bool) -> DocumentResponse:
    """Build the response with the *current user's* favorite state.

    The row's ``is_favorite`` column is the owner's denormalized flag and
    must not leak to other users.
    """
    response = DocumentResponse.model_validate(document)
    response.is_favorite = favorited
    return response
