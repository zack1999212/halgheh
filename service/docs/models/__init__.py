from .workspace import PERSONAL_WORKSPACE, SHARED_WORKSPACE, WORKSPACE_TYPES, Workspace
from .folder import Folder
from .document import Document
from .document_link import (
    LINK_TYPE_DEPENDS_ON,
    LINK_TYPE_REFERENCE,
    LINK_TYPE_RELATED,
    DocumentLink,
)
from .tag import Tag
from .document_tag import DocumentTag
from .document_version import DocumentVersion
from .document_favorite import DocumentFavorite
from .document_permission import (
    PERMISSION_EDITOR,
    PERMISSION_VIEWER,
    DocumentPermission,
)

__all__ = [
    "Workspace",
    "WORKSPACE_TYPES",
    "PERSONAL_WORKSPACE",
    "SHARED_WORKSPACE",
    "Folder",
    "Document",
    "DocumentLink",
    "LINK_TYPE_RELATED",
    "LINK_TYPE_REFERENCE",
    "LINK_TYPE_DEPENDS_ON",
    "Tag",
    "DocumentTag",
    "DocumentVersion",
    "DocumentFavorite",
    "DocumentPermission",
    "PERMISSION_VIEWER",
    "PERMISSION_EDITOR",
]
