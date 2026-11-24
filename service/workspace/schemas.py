from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..docs.models import WORKSPACE_TYPES
from .models import WORKSPACE_INVITABLE_ROLES, WORKSPACE_MEMBER_ROLES


class WorkspaceOwnerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    name: str | None = None


class WorkspaceSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    workspace_type: str


class WorkspaceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=5000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Workspace name must not be empty")
        return trimmed


class WorkspaceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=5000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Workspace name must not be empty")
        return trimmed

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    workspace_type: str
    owner_id: int
    owner: WorkspaceOwnerOut | None = None
    current_user_role: str
    created_at: datetime
    updated_at: datetime


class WorkspaceListResponse(BaseModel):
    items: list[WorkspaceResponse]
    total: int
    limit: int
    offset: int


class WorkspaceMemberRoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in WORKSPACE_MEMBER_ROLES:
            raise ValueError(f"Unknown member role: {value}")
        return value


class WorkspaceMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    user_id: int
    role: str
    joined_at: datetime
    created_at: datetime
    updated_at: datetime
    username: str | None = None
    name: str | None = None


class WorkspaceInvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(..., min_length=1, max_length=255)
    role: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Username must not be empty")
        return trimmed

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in WORKSPACE_INVITABLE_ROLES:
            raise ValueError(f"Unknown invitation role: {value}")
        return value


class WorkspaceInvitationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    inviter_id: int
    invitee_id: int
    invitee_username: str | None = None
    role: str
    status: str
    created_at: datetime
    expires_at: datetime
    responded_at: datetime | None
    revoked_at: datetime | None


class ReceivedWorkspaceInvitationResponse(WorkspaceInvitationResponse):
    workspace_name: str | None = None
    inviter_username: str | None = None
    inviter_name: str | None = None


class WorkspaceActivityActor(BaseModel):
    id: int
    username: str | None = None
    name: str | None = None
    avatar_url: str | None = None


class WorkspaceActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int | None = None
    workspace_name: str | None = None
    project_id: int | None = None
    actor: WorkspaceActivityActor | None = None
    event_type: str
    category: str
    entity_type: str
    entity_id: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class WorkspaceActivityListResponse(BaseModel):
    items: list[WorkspaceActivityResponse]
    total: int
    limit: int
    offset: int
