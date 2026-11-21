"""Pydantic v2 schemas for the Document Management module.

Schemas are the API contract only: no business logic, no database access.
They never import from repositories or services, so no import cycles are
possible.
"""

from .common import Page
from .workspace import (
    WorkspaceCreate,
    WorkspaceListResponse,
    WorkspaceResponse,
    WorkspaceUpdate,
)
from .folder import (
    FolderCreate,
    FolderListResponse,
    FolderNode,
    FolderResponse,
    FolderTreeResponse,
    FolderUpdate,
)
from .document import (
    DocumentCreate,
    DocumentDetailResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentSort,
    DocumentUpdate,
    WikiResolutionInfo,
)
from .version import (
    DocumentVersionListResponse,
    DocumentVersionResponse,
)
from .tag import (
    TagCreate,
    TagListResponse,
    TagResponse,
    TagUpdate,
)
from .link import (
    DocumentGraphResponse,
    DocumentLinkCreate,
    DocumentLinkResponse,
    DocumentLinksResponse,
    GraphEdge,
    GraphNode,
    LinkedDocumentInfo,
)
from .permission import (
    DocumentPermissionCreate,
    DocumentPermissionResponse,
    DocumentPermissionUpdate,
)
from .favorite import DocumentFavoriteResponse

__all__ = [
    "Page",
    "WorkspaceCreate",
    "WorkspaceListResponse",
    "WorkspaceResponse",
    "WorkspaceUpdate",
    "FolderCreate",
    "FolderListResponse",
    "FolderNode",
    "FolderResponse",
    "FolderTreeResponse",
    "FolderUpdate",
    "DocumentCreate",
    "DocumentDetailResponse",
    "DocumentListResponse",
    "DocumentResponse",
    "DocumentSort",
    "DocumentUpdate",
    "WikiResolutionInfo",
    "DocumentVersionListResponse",
    "DocumentVersionResponse",
    "TagCreate",
    "TagListResponse",
    "TagResponse",
    "TagUpdate",
    "DocumentGraphResponse",
    "DocumentLinkCreate",
    "DocumentLinkResponse",
    "DocumentLinksResponse",
    "GraphEdge",
    "GraphNode",
    "LinkedDocumentInfo",
    "DocumentPermissionCreate",
    "DocumentPermissionResponse",
    "DocumentPermissionUpdate",
    "DocumentFavoriteResponse",
]
