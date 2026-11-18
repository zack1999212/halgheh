"""Pydantic v2 schemas for the task module.

Conventions mirror ``service/calendar/schemas.py``: ``ConfigDict
(from_attributes=True)`` responses, ``field_validator`` strip/non-empty
checks, ``model_validator(mode="after")`` guards for empty PATCH bodies and
cross-field date rules, and stable-string enums validated against the
constants exported by ``service/task/models``.

The authenticated actor is NEVER accepted in any request schema — the actor
comes from the existing ``get_current_user`` dependency. ``TaskAssignment
Create.assigned_user_id`` is the only user id a client may supply, and it is
the *target* of the assignment, validated server-side.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import DONE_STATUS, TASK_PRIORITIES, TASK_STATUSES

StatusFilterValue = Literal["overdue", "today", "upcoming", "no_due"]
SortField = Literal["due_date", "created_at", "updated_at", "priority"]
SortOrder = Literal["asc", "desc"]


# ---------------------------------------------------------------------------
# Filters / pagination
# ---------------------------------------------------------------------------


class TaskFilter(BaseModel):
    """Filtering, searching, sorting and pagination for task list queries.

    Validated here so both the router (query params) and the tests can build
    filters without re-implementing validation.
    """

    status: list[str] = Field(default_factory=list)
    priority: list[str] = Field(default_factory=list)
    created_by: int | None = None
    assigned_user_id: int | None = None
    parent_task_id: int | None = None
    label_id: int | None = None
    due: StatusFilterValue | None = None
    q: str | None = Field(default=None, max_length=200)
    sort: SortField | None = None
    order: SortOrder = "asc"
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: list[str]) -> list[str]:
        for item in value:
            if item not in TASK_STATUSES:
                raise ValueError(f"Unknown task status: {item}")
        return value

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: list[str]) -> list[str]:
        for item in value:
            if item not in TASK_PRIORITIES:
                raise ValueError(f"Unknown task priority: {item}")
        return value

    @field_validator("q")
    @classmethod
    def validate_q(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    priority: str = "medium"
    start_date: date | None = None
    due_date: date | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Task title must not be empty")
        return trimmed

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str) -> str:
        if value not in TASK_PRIORITIES:
            raise ValueError(f"Unknown task priority: {value}")
        return value

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date and self.due_date and self.due_date < self.start_date:
            raise ValueError("due_date must not be earlier than start_date")
        return self


class SubtaskCreate(TaskCreate):
    """Creation payload for a subtask; the parent is mandatory."""

    parent_task_id: int


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    priority: str | None = None
    start_date: date | None = None
    due_date: date | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Task title must not be empty")
        return trimmed

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in TASK_PRIORITIES:
            raise ValueError(f"Unknown task priority: {value}")
        return value

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self

    @model_validator(mode="after")
    def validate_title_not_null(self):
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("Task title must not be null")
        return self


class TaskStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in TASK_STATUSES:
            raise ValueError(f"Unknown task status: {value}")
        return value


class TaskParentUpdate(BaseModel):
    """Set or detach a task's parent (hierarchy changes bypass PATCH)."""

    model_config = ConfigDict(extra="forbid")

    parent_task_id: int | None = None


class TaskStatisticsOut(BaseModel):
    """Aggregated counters over the authenticated user's visible tasks."""

    total: int
    open: int
    completed: int
    cancelled: int
    overdue: int
    due_today: int
    completion_rate: float
    by_status: dict[str, int]
    by_priority: dict[str, int]


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------


class TaskAssignmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assigned_user_id: int


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------


class TaskCommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(..., min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Comment content must not be empty")
        return trimmed


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------


class TaskLabelCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=64)
    color: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Label name must not be empty")
        return trimmed

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if len(value) != 7 or value[0] != "#":
            raise ValueError("color must be a hex value like #RRGGBB")
        return value


class TaskLabelUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=64)
    color: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Label name must not be empty")
        return trimmed

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if len(value) != 7 or value[0] != "#":
            raise ValueError("color must be a hex value like #RRGGBB")
        return value

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------


class TaskLabelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str | None
    created_by: int


class TaskAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    assigned_user_id: int
    assigned_by: int
    assignment_status: str
    assigned_at: datetime


class TaskCommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    user_id: int
    content: str
    created_at: datetime
    updated_at: datetime


class TaskActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int | None
    task_id: int | None
    actor_id: int | None
    action: str
    old_value: str | None
    new_value: str | None
    created_at: datetime


class TaskSummary(BaseModel):
    """List-view shape: scalar fields only, so lists never touch relations
    (N+1-free by construction)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: str
    priority: str
    start_date: date | None
    due_date: date | None
    completed_at: datetime | None
    parent_task_id: int | None
    created_by: int
    created_at: datetime
    updated_at: datetime


class TaskResponse(TaskSummary):
    """Detail shape: adds description plus the loaded relations."""

    description: str | None
    labels: list[TaskLabelOut] = Field(default_factory=list)
    assignments: list[TaskAssignmentOut] = Field(default_factory=list)


class TaskListResponse(BaseModel):
    items: list[TaskSummary]
    total: int
    limit: int
    offset: int


class TaskCommentListResponse(BaseModel):
    items: list[TaskCommentOut]
    total: int
    limit: int
    offset: int


class TaskActivityListResponse(BaseModel):
    items: list[TaskActivityOut]
    total: int
    limit: int
    offset: int


class TaskLabelListResponse(BaseModel):
    items: list[TaskLabelOut]
    total: int
    limit: int
    offset: int


__all__ = [
    "DONE_STATUS",
    "SortField",
    "SortOrder",
    "StatusFilterValue",
    "SubtaskCreate",
    "TaskActivityListResponse",
    "TaskActivityOut",
    "TaskAssignmentCreate",
    "TaskAssignmentOut",
    "TaskCommentCreate",
    "TaskCommentListResponse",
    "TaskCommentOut",
    "TaskCreate",
    "TaskFilter",
    "TaskLabelCreate",
    "TaskLabelListResponse",
    "TaskLabelOut",
    "TaskLabelUpdate",
    "TaskListResponse",
    "TaskParentUpdate",
    "TaskResponse",
    "TaskStatisticsOut",
    "TaskStatusUpdate",
    "TaskSummary",
    "TaskUpdate",
]
