from __future__ import annotations

from datetime import date, datetime
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

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Event title must not be empty")
        return trimmed

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

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Event title must not be empty")
        return trimmed

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
