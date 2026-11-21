"""Pydantic schemas for the project module."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import (
    INVITABLE_ROLES,
    INVITATION_STATUSES,
    MILESTONE_STATUSES,
    PROJECT_STATUSES,
)
from .permissions import MANAGEABLE_MEMBER_ROLES
from ..calendar.schemas import OccurrenceResponse


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    start_date: date | None = None
    target_date: date | None = None
    color: str | None = Field(default=None, max_length=32)
    icon: str | None = Field(default=None, max_length=64)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Project name must not be empty")
        return trimmed

    @field_validator("color", "icon")
    @classmethod
    def validate_optional_trimmed(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date and self.target_date and self.target_date < self.start_date:
            raise ValueError("target_date must not be earlier than start_date")
        return self


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    status: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    color: str | None = Field(default=None, max_length=32)
    icon: str | None = Field(default=None, max_length=64)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Project name must not be empty")
        return trimmed

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value not in PROJECT_STATUSES:
            raise ValueError(f"Unknown project status: {value}")
        return value

    @field_validator("color", "icon")
    @classmethod
    def validate_optional_trimmed(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self

    @model_validator(mode="after")
    def validate_name_not_null(self):
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Project name must not be null")
        return self

    @model_validator(mode="after")
    def validate_status_not_null(self):
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("Project status must not be null")
        return self


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    name: str
    description: str | None
    status: str
    start_date: date | None
    target_date: date | None
    color: str | None
    icon: str | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    current_user_role: str


class ProjectListResponse(BaseModel):
    items: list[ProjectResponse]
    total: int
    limit: int
    offset: int


# --- Invitations ---


class ProjectInvitationCreate(BaseModel):
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
        if value not in INVITABLE_ROLES:
            raise ValueError(f"Unknown invitation role: {value}")
        return value


class ProjectInvitationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    inviter_id: int
    invitee_id: int
    invitee_username: str
    role: str
    status: str
    created_at: datetime
    expires_at: datetime
    responded_at: datetime | None
    revoked_at: datetime | None


class ReceivedProjectInvitationResponse(ProjectInvitationResponse):
    project_name: str | None = None
    inviter_username: str | None = None
    inviter_name: str | None = None


# --- Members ---


class ProjectMemberRoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in MANAGEABLE_MEMBER_ROLES:
            raise ValueError(f"Unknown member role: {value}")
        return value


class ProjectMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    user_id: int
    role: str
    joined_at: datetime
    created_at: datetime
    updated_at: datetime
    username: str | None = None
    name: str | None = None


# --- Milestone steps ---


class MilestoneStepCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    position: int | None = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Step title must not be empty")
        return trimmed


class MilestoneStepUpdate(BaseModel):
    """Partial step update. Position reordering uses dedicated endpoint."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Step title must not be empty")
        return trimmed

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self

    @model_validator(mode="after")
    def validate_non_nullable_fields(self):
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("Step title must not be null")
        return self


class MilestoneStepReorderItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int = Field(..., ge=1)
    position: int = Field(..., ge=0)


class MilestoneStepReorderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[MilestoneStepReorderItem] = Field(..., min_length=1)


class MilestoneStepResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    milestone_id: int
    title: str
    description: str | None
    position: int
    is_completed: bool
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


# --- Milestones ---


class MilestoneCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    due_date: date | None = None
    position: int | None = Field(default=None, ge=0)
    steps: list[MilestoneStepCreate] | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Milestone title must not be empty")
        return trimmed


class MilestoneUpdate(BaseModel):
    """Partial milestone update.

    Omitted fields are untouched; explicitly supplied ``null`` clears
    ``description``/``due_date``. Progress/completion are derived from steps.
    """

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    due_date: date | None = None
    position: int | None = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Milestone title must not be empty")
        return trimmed

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self

    @model_validator(mode="after")
    def validate_non_nullable_fields(self):
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("Milestone title must not be null")
        if "position" in self.model_fields_set and self.position is None:
            raise ValueError("Milestone position must not be null")
        return self


class MilestoneReorderItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int = Field(..., ge=1)
    position: int = Field(..., ge=0)


class MilestoneReorderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[MilestoneReorderItem] = Field(..., min_length=1)


class MilestoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    title: str
    description: str | None
    status: str
    position: int = 0
    due_date: date | None
    completed_at: datetime | None
    created_by: int
    created_at: datetime
    updated_at: datetime
    progress: float = 0.0
    completed_steps: int = 0
    total_steps: int = 0
    steps: list[MilestoneStepResponse] = Field(default_factory=list)


class MilestoneListResponse(BaseModel):
    items: list[MilestoneResponse]
    total: int
    limit: int
    offset: int


# --- Project overview ---


class ProjectOverviewProject(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    name: str
    description: str | None
    status: str
    start_date: date | None
    target_date: date | None
    color: str | None
    icon: str | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TaskProgressMetrics(BaseModel):
    total: int
    completed: int
    in_progress: int
    pending: int
    other: int


class ProjectProgress(BaseModel):
    percentage: float
    tasks: TaskProgressMetrics


class UpcomingMilestone(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: str
    due_date: date | None
    progress: float = 0.0
    completed_steps: int = 0
    total_steps: int = 0
    next_incomplete_step: str | None = None


class MilestoneMetrics(BaseModel):
    total: int
    pending: int
    in_progress: int
    completed: int
    cancelled: int
    upcoming: list[UpcomingMilestone]


class MembershipMetrics(BaseModel):
    total_members: int
    owner: int
    admin: int
    editor: int
    viewer: int


class ProjectOverviewResponse(BaseModel):
    project: ProjectOverviewProject
    current_user_role: str
    progress: ProjectProgress
    milestones: MilestoneMetrics
    members: MembershipMetrics
    upcoming_events: list[OccurrenceResponse]


# --- Activity ---


class ProjectActivityActor(BaseModel):
    id: int
    username: str | None = None
    name: str | None = None


class ProjectActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: str
    entity_type: str
    entity_id: int | None = None
    project_id: int
    actor: ProjectActivityActor | None = None
    metadata: dict | None = None
    created_at: datetime


class ProjectActivityListResponse(BaseModel):
    items: list[ProjectActivityResponse]
    total: int
    limit: int
    offset: int
