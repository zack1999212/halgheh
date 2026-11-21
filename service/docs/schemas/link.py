from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

# Kept in sync with the ck_document_links_link_type database constraint.
LinkType = Literal["related", "reference", "depends_on"]


class DocumentLinkCreate(BaseModel):
    target_document_id: int
    link_type: LinkType


class LinkedDocumentInfo(BaseModel):
    """Minimal document metadata for link/backlink/graph displays."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    workspace_id: int
    folder_id: int | None = None
    folder_name: str | None = None
    is_deleted: bool = False


class DocumentLinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_document_id: int
    target_document_id: int
    link_type: str
    created_at: datetime
    # Additive metadata (backward-compatible). Populated when the linked
    # document is accessible to the current user and not deleted.
    source_document: LinkedDocumentInfo | None = None
    target_document: LinkedDocumentInfo | None = None


class DocumentLinksResponse(BaseModel):
    outgoing: list[DocumentLinkResponse]
    incoming: list[DocumentLinkResponse]


class GraphNode(BaseModel):
    id: int
    title: str
    workspace_id: int
    folder_id: int | None = None
    folder_name: str | None = None


class GraphEdge(BaseModel):
    id: int
    source_document_id: int
    target_document_id: int
    link_type: str


class DocumentGraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    # True when the workspace has more documents than the graph page limit,
    # meaning the displayed graph is incomplete (shown as a notice in the UI).
    truncated: bool = False
