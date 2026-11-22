from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .common import Page


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    name: str
    description: str | None
    workspace_type: str = "personal"
    created_at: datetime
    updated_at: datetime


class WorkspaceListResponse(Page):
    items: list[WorkspaceResponse]
