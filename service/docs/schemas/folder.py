from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .common import Page


class FolderCreate(BaseModel):
    workspace_id: int
    parent_id: int | None = None
    name: str = Field(min_length=1, max_length=128)


class FolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    # Explicitly sending null moves the folder to the workspace root.
    parent_id: int | None = None

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self


class FolderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    parent_id: int | None
    name: str
    created_at: datetime
    updated_at: datetime


class FolderListResponse(Page):
    items: list[FolderResponse]


class FolderNode(FolderResponse):
    """A folder in the hierarchical tree view, with nested children.

    Roots are returned in ``FolderTreeResponse.items``; their descendants
    appear only in ``children``, so every folder occurs exactly once.
    """

    children: list["FolderNode"] = []


FolderNode.model_rebuild()


class FolderTreeResponse(BaseModel):
    items: list[FolderNode]
    total: int
