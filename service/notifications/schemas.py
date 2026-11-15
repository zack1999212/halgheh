from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


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
    occurrence_start_at: datetime | None
    occurrence_start_date: date | None
    created_at: datetime
    updated_at: datetime


class UnreadCountResponse(BaseModel):
    count: int
