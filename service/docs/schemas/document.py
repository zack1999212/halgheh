from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .common import Page
from .folder import FolderResponse
from .tag import TagResponse

# Stable sort identifiers mirrored by the repository's ORDER BY mapping.
DocumentSort = Literal[
    "updated_desc",
    "updated_asc",
    "created_desc",
    "created_asc",
    "title_asc",
    "title_desc",
]


class DocumentCreate(BaseModel):
    workspace_id: int
    folder_id: int | None = None
    project_id: int | None = None
    title: str = Field(min_length=1, max_length=256)
    content: str = Field(default="", max_length=500_000)
    icon: str | None = Field(default=None, max_length=32)


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=256)
    # Changing content or title snapshots a new version (service layer).
    content: str | None = Field(default=None, max_length=500_000)
    icon: str | None = Field(default=None, max_length=32)
    folder_id: int | None = None
    project_id: int | None = None
    is_archived: bool | None = None

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self


class WorkspaceSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    workspace_type: str


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    folder_id: int | None
    project_id: int | None = None
    owner_id: int
    title: str
    content: str
    slug: str
    icon: str | None
    # Per-user favorite state, resolved by the service layer for the
    # authenticated user (not the denormalized owner flag).
    is_favorite: bool
    is_archived: bool
    is_deleted: bool
    # Per-user write access. Read-only viewers must not be offered editing
    # affordances (autosave, AI apply). The backend remains authoritative.
    can_edit: bool = True
    created_at: datetime
    updated_at: datetime
    workspaces: list[WorkspaceSummaryOut] = Field(default_factory=list)


class DocumentListResponse(Page):
    items: list[DocumentResponse]


class WikiResolutionInfo(BaseModel):
    """Backend-authoritative status of one wiki token in a document body.

    Additive companion to ``DocumentDetailResponse.wiki_resolutions``: keys
    are the exact token titles as written in the content. Only resolved
    entries carry target metadata (documents the caller can already read);
    ambiguous/unresolved entries never expose document data.
    """

    status: Literal["resolved", "ambiguous", "unresolved"]
    document_id: int | None = None
    title: str | None = None
    folder_id: int | None = None
    folder_name: str | None = None


class DocumentDetailResponse(DocumentResponse):
    """Single-document view: adds the folder object and attached tags.

    List endpoints keep returning plain ``DocumentResponse`` so paginated
    payloads stay small; tags and the folder object are resolved only for
    the detail read.
    """

    folder: FolderResponse | None = None
    tags: list[TagResponse] = []
    # Wiki token -> resolution status for this document's content, computed
    # by the backend with the same rules as wiki link synchronization. The
    # editor preview treats this map as the single source of truth (empty
    # map => every token renders as neutral "unknown", never clickable).
    wiki_resolutions: dict[str, WikiResolutionInfo] = Field(default_factory=dict)
