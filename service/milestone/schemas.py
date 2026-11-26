"""Pydantic schemas for workspace milestones."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class MilestoneTaskSummary(BaseModel):
    """Task state embedded in a step, so the frontend can render ticks."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: str
    description: str | None
    due_date: date | None


class MilestoneStepCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    position: int | None = Field(default=None, ge=0)
    task_ids: list[int] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Step title must not be empty")
        return trimmed

    @field_validator("task_ids")
    @classmethod
    def validate_task_ids(cls, value: list[int]) -> list[int]:
        if any(task_id < 1 for task_id in value):
            raise ValueError("Task IDs must be positive integers")
        if len(set(value)) != len(value):
            raise ValueError("Task IDs must not contain duplicates")
        return value


class MilestoneStepUpdate(BaseModel):
    """Partial step update. Reordering uses the dedicated endpoint."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    task_ids: list[int] | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Step title must not be empty")
        return trimmed

    @field_validator("task_ids")
    @classmethod
    def validate_task_ids(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        if any(task_id < 1 for task_id in value):
            raise ValueError("Task IDs must be positive integers")
        if len(set(value)) != len(value):
            raise ValueError("Task IDs must not contain duplicates")
        return value

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
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
    tasks: list[MilestoneTaskSummary] = Field(default_factory=list)
    completed_tasks: int = 0
    total_tasks: int = 0
    progress: float = 0.0
    is_completed: bool = False
    created_at: datetime
    updated_at: datetime


class MilestoneCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    due_date: date | None = None
    position: int | None = Field(default=None, ge=0)
    steps: list[MilestoneStepCreate] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Milestone title must not be empty")
        return trimmed


class MilestoneUpdate(BaseModel):
    """Status, progress and completion are derived from tasks — never set here."""

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
    workspace_id: int
    title: str
    description: str | None
    status: str
    position: int
    due_date: date | None
    completed_at: datetime | None
    created_by: int
    created_at: datetime
    updated_at: datetime
    progress: float = 0.0
    completed_steps: int = 0
    total_steps: int = 0
    completed_tasks: int = 0
    total_tasks: int = 0
    current_step_id: int | None = None
    steps: list[MilestoneStepResponse] = Field(default_factory=list)


class MilestoneListResponse(BaseModel):
    items: list[MilestoneResponse]
    total: int
    limit: int
    offset: int
