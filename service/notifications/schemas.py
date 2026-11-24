from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    type: str
    title: str
    message: str
    is_read: bool
    read_at: datetime | None
    event_id: int | None
    reminder_id: int | None
    scheduled_reminder_id: int | None
    invitation_id: int | None
    occurrence_start_at: datetime | None
    occurrence_start_date: date | None
    created_at: datetime
    updated_at: datetime


class UnreadCountResponse(BaseModel):
    count: int


class NotificationPreferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    calendar_reminders_enabled: bool
    created_at: datetime
    updated_at: datetime


class NotificationPreferenceUpdate(BaseModel):
    calendar_reminders_enabled: bool | None = None

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self


class NotificationBulkResponse(BaseModel):
    updated: int