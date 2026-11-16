from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CalendarCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    color: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Calendar name must not be empty")
        return trimmed


class CalendarUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Calendar name must not be empty")
        return trimmed

    @model_validator(mode="after")
    def validate_name_not_null(self):
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Calendar name must not be null")
        return self

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self


class CalendarResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    color: str | None
    is_default: bool
    created_at: datetime
    updated_at: datetime


def _validate_iana_timezone(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        raise ValueError("timezone must be a valid IANA timezone identifier")
    return value


# Stable category identifiers stored on events; display labels and colors are
# frontend concerns. "other" is the default and the fallback for unknown values.
ALLOWED_EVENT_CATEGORIES = (
    "work",
    "personal",
    "meeting",
    "focus",
    "important",
    "other",
)
DEFAULT_EVENT_CATEGORY = "other"


def _validate_event_category(value: str) -> str:
    if value not in ALLOWED_EVENT_CATEGORIES:
        raise ValueError("category must be one of: " + ", ".join(ALLOWED_EVENT_CATEGORIES))
    return value


class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    location: str | None = None
    is_all_day: bool = False
    start_at: datetime | None = None
    end_at: datetime | None = None
    start_date: date | None = None
    end_date: date | None = None
    timezone: str | None = None
    recurrence_rule: str | None = None
    category: str = DEFAULT_EVENT_CATEGORY

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Event title must not be empty")
        return trimmed

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        return _validate_event_category(value)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _validate_iana_timezone(value)

    @model_validator(mode="after")
    def validate_event_shape(self):
        if self.is_all_day:
            if self.start_date is None or self.end_date is None:
                raise ValueError("All-day events must provide start_date and end_date")
            if self.end_date <= self.start_date:
                raise ValueError("end_date must be later than start_date")
            if any(v is not None for v in (self.start_at, self.end_at, self.timezone)):
                raise ValueError("All-day events must not provide start_at, end_at, or timezone")
        else:
            if self.start_at is None or self.end_at is None or self.timezone is None:
                raise ValueError("Timed events must provide start_at, end_at, and timezone")
            if self.start_at.tzinfo is None or self.start_at.utcoffset() is None:
                raise ValueError("start_at must be timezone-aware")
            if self.end_at.tzinfo is None or self.end_at.utcoffset() is None:
                raise ValueError("end_at must be timezone-aware")
            if self.end_at <= self.start_at:
                raise ValueError("end_at must be later than start_at")
            if self.start_date is not None or self.end_date is not None:
                raise ValueError("Timed events must not provide start_date or end_date")
        return self


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    description: str | None = None
    location: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    start_date: date | None = None
    end_date: date | None = None
    timezone: str | None = None
    recurrence_rule: str | None = None
    category: str | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Event title must not be empty")
        return trimmed

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _validate_event_category(value)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _validate_iana_timezone(value)

    @model_validator(mode="after")
    def validate_patch_constraints(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("Event title must not be null")
        # Required date/time fields cannot be explicitly cleared; resulting state is
        # validated in the service layer against the existing event.
        for field in ("start_at", "end_at", "start_date", "end_date", "timezone"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be cleared")
        return self


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    calendar_id: int
    title: str
    description: str | None
    location: str | None
    is_all_day: bool
    start_at: datetime | None
    end_at: datetime | None
    start_date: date | None
    end_date: date | None
    timezone: str | None
    recurrence_rule: str | None
    category: str
    created_at: datetime
    updated_at: datetime


class EventExceptionCreate(BaseModel):
    original_start_at: datetime | None = None
    original_start_date: date | None = None
    is_cancelled: bool = False
    title: str | None = None
    description: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_original_identity(self):
        has_at = self.original_start_at is not None
        has_date = self.original_start_date is not None
        if has_at == has_date:
            raise ValueError("Exactly one of original_start_at or original_start_date must be provided")
        return self


class EventExceptionUpdate(BaseModel):
    is_cancelled: bool | None = None
    title: str | None = None
    description: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self


class OccurrenceEditRequest(BaseModel):
    scope: str
    original_start_at: datetime | None = None
    original_start_date: date | None = None
    title: str | None = Field(default=None, max_length=255)
    description: str | None = None
    location: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    start_date: date | None = None
    end_date: date | None = None
    timezone: str | None = None
    recurrence_rule: str | None = None
    category: str | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Event title must not be empty")
        return trimmed

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _validate_event_category(value)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError, KeyError):
            raise ValueError("Invalid timezone")
        return value

    @model_validator(mode="after")
    def validate_request(self):
        has_at = self.original_start_at is not None
        has_date = self.original_start_date is not None
        if has_at == has_date:
            raise ValueError("Exactly one of original_start_at or original_start_date must be provided")
        if self.scope not in ("occurrence", "series", "following"):
            raise ValueError("scope must be occurrence, series, or following")
        fields = [
            "title",
            "description",
            "location",
            "start_at",
            "end_at",
            "start_date",
            "end_date",
            "timezone",
            "recurrence_rule",
            "category",
        ]
        if not any(getattr(self, f) is not None for f in fields):
            raise ValueError("Update payload must not be empty")
        return self


class OccurrenceEditResponse(BaseModel):
    scope: str
    event: EventResponse | None = None
    original_event: EventResponse | None = None
    new_event: EventResponse | None = None
    split_at: datetime | date | None = None


class EventExceptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    original_start_at: datetime | None
    original_start_date: date | None
    is_cancelled: bool
    title: str | None
    description: str | None
    start_at: datetime | None
    end_at: datetime | None
    start_date: date | None
    end_date: date | None
    created_at: datetime
    updated_at: datetime


class OccurrenceResponse(BaseModel):
    event_id: int
    title: str
    description: str | None
    is_all_day: bool
    start_at: datetime | None
    end_at: datetime | None
    start_date: date | None
    end_date: date | None
    timezone: str | None
    original_start_at: datetime | None
    original_start_date: date | None
    is_recurring: bool
    is_exception: bool
    category: str


class ReminderCreate(BaseModel):
    minutes_before: int = Field(..., ge=0)


class ReminderUpdate(BaseModel):
    minutes_before: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        if "minutes_before" in self.model_fields_set and self.minutes_before is None:
            raise ValueError("minutes_before must not be null")
        return self


class ReminderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    minutes_before: int
    created_at: datetime
    updated_at: datetime


class EventCommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Comment content must not be empty")
        if len(trimmed) > 5000:
            raise ValueError("Comment content must not exceed 5000 characters")
        return trimmed


class EventCommentUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Comment content must not be empty")
        if len(trimmed) > 5000:
            raise ValueError("Comment content must not exceed 5000 characters")
        return trimmed

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self


class EventCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    content: str
    created_at: datetime
    updated_at: datetime
