from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..auth.models import User
from ..core.database import get_db
from . import service
from .schemas import (
    CalendarCreate,
    CalendarResponse,
    CalendarUpdate,
    EventCreate,
    EventCommentCreate,
    EventCommentUpdate,
    EventExceptionCreate,
    EventExceptionResponse,
    EventExceptionUpdate,
    EventCommentResponse,
    EventResponse,
    OccurrenceEditRequest,
    OccurrenceEditResponse,
    EventUpdate,
    ReminderCreate,
    ReminderResponse,
    ReminderUpdate,
    OccurrenceResponse,
)

router = APIRouter(prefix="/calendars", tags=["calendars"])


# --- Calendar endpoints ---


@router.post("", response_model=CalendarResponse, status_code=status.HTTP_201_CREATED)
def create_calendar(
    data: CalendarCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_calendar(db, current_user.id, data)


@router.get("", response_model=list[CalendarResponse])
def list_calendars(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_calendars(db, current_user.id)


@router.get("/{calendar_id}", response_model=CalendarResponse)
def get_calendar(
    calendar_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_calendar(db, calendar_id, current_user.id)


@router.patch("/{calendar_id}", response_model=CalendarResponse)
def update_calendar(
    calendar_id: int,
    data: CalendarUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_calendar(db, calendar_id, current_user.id, data)


@router.put("/{calendar_id}/default", response_model=CalendarResponse)
def set_default_calendar(
    calendar_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.set_default_calendar(db, calendar_id, current_user.id)


@router.delete("/{calendar_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_calendar(
    calendar_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_calendar(db, calendar_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Event endpoints ---


@router.post(
    "/{calendar_id}/events",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_event(
    calendar_id: int,
    data: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = service.create_event(db, calendar_id, current_user.id, data)
    return service.attach_event_workspaces(db, current_user.id, [event])[0]


# Project events (declared before the /{calendar_id} collection routes so the
# static segment is never parsed as a calendar id).


@router.get("/project/{project_id}/events", response_model=list[EventResponse])
def list_project_events(
    project_id: int,
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    timezone: str | None = Query(default=None),
    workspace_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    events = service.list_project_events(
        db,
        project_id,
        current_user.id,
        start=start,
        end=end,
        timezone=timezone,
        workspace_id=workspace_id,
    )
    return service.attach_event_workspaces(db, current_user.id, events)


@router.get(
    "/project/{project_id}/occurrences", response_model=list[OccurrenceResponse]
)
def list_project_occurrences(
    project_id: int,
    start: datetime = Query(...),
    end: datetime = Query(...),
    timezone: str = Query(...),
    workspace_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    occ = service.list_project_occurrences(
        db, project_id, current_user.id, start, end, timezone, workspace_id=workspace_id
    )
    return service.attach_occurrence_workspaces(db, current_user.id, occ)


@router.get("/{calendar_id}/events", response_model=list[EventResponse])
def list_events(
    calendar_id: int,
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    timezone: str | None = Query(default=None),
    project_id: int | None = Query(default=None),
    workspace_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    events = service.list_events(
        db,
        calendar_id,
        current_user.id,
        start=start,
        end=end,
        timezone=timezone,
        project_id=project_id,
        workspace_id=workspace_id,
    )
    return service.attach_event_workspaces(db, current_user.id, events)


@router.get("/{calendar_id}/events/{event_id}", response_model=EventResponse)
def get_event(
    calendar_id: int,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = service.get_event(db, calendar_id, event_id, current_user.id)
    return service.attach_event_workspaces(db, current_user.id, [event])[0]


@router.patch("/{calendar_id}/events/{event_id}", response_model=EventResponse)
def update_event(
    calendar_id: int,
    event_id: int,
    data: EventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = service.update_event(db, calendar_id, event_id, current_user.id, data)
    return service.attach_event_workspaces(db, current_user.id, [event])[0]


@router.delete("/{calendar_id}/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    calendar_id: int,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_event(db, calendar_id, event_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{calendar_id}/occurrences", response_model=list[OccurrenceResponse])
def list_occurrences(
    calendar_id: int,
    start: datetime = Query(...),
    end: datetime = Query(...),
    timezone: str = Query(...),
    project_id: int | None = Query(default=None),
    workspace_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    occ = service.list_occurrences(
        db, calendar_id, current_user.id, start, end, timezone, project_id=project_id, workspace_id=workspace_id
    )
    return service.attach_occurrence_workspaces(db, current_user.id, occ)


# --- Event exception endpoints ---


@router.post(
    "/{calendar_id}/events/{event_id}/exceptions",
    response_model=EventExceptionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_exception(
    calendar_id: int,
    event_id: int,
    data: EventExceptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_exception(db, calendar_id, event_id, current_user.id, data)


@router.get(
    "/{calendar_id}/events/{event_id}/exceptions",
    response_model=list[EventExceptionResponse],
)
def list_exceptions(
    calendar_id: int,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_exceptions(db, calendar_id, event_id, current_user.id)


@router.get(
    "/{calendar_id}/events/{event_id}/exceptions/{exception_id}",
    response_model=EventExceptionResponse,
)
def get_exception(
    calendar_id: int,
    event_id: int,
    exception_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_exception(db, calendar_id, event_id, exception_id, current_user.id)


@router.patch(
    "/{calendar_id}/events/{event_id}/exceptions/{exception_id}",
    response_model=EventExceptionResponse,
)
def update_exception(
    calendar_id: int,
    event_id: int,
    exception_id: int,
    data: EventExceptionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_exception(db, calendar_id, event_id, exception_id, current_user.id, data)


@router.delete(
    "/{calendar_id}/events/{event_id}/exceptions/{exception_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_exception(
    calendar_id: int,
    event_id: int,
    exception_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_exception(db, calendar_id, event_id, exception_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch(
    "/{calendar_id}/events/{event_id}/occurrences",
    response_model=OccurrenceEditResponse,
)
def edit_occurrence(
    calendar_id: int,
    event_id: int,
    data: OccurrenceEditRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = service.edit_occurrence(db, calendar_id, event_id, current_user.id, data)
    return OccurrenceEditResponse(**result)


# --- Reminder endpoints ---


@router.post(
    "/{calendar_id}/events/{event_id}/reminders",
    response_model=ReminderResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_reminder(
    calendar_id: int,
    event_id: int,
    data: ReminderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_reminder(db, calendar_id, event_id, current_user.id, data)


@router.get(
    "/{calendar_id}/events/{event_id}/reminders",
    response_model=list[ReminderResponse],
)
def list_reminders(
    calendar_id: int,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_reminders(db, calendar_id, event_id, current_user.id)


@router.patch(
    "/{calendar_id}/events/{event_id}/reminders/{reminder_id}",
    response_model=ReminderResponse,
)
def update_reminder(
    calendar_id: int,
    event_id: int,
    reminder_id: int,
    data: ReminderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_reminder(db, calendar_id, event_id, reminder_id, current_user.id, data)


@router.delete(
    "/{calendar_id}/events/{event_id}/reminders/{reminder_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_reminder(
    calendar_id: int,
    event_id: int,
    reminder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_reminder(db, calendar_id, event_id, reminder_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Event comment endpoints ---


@router.post(
    "/{calendar_id}/events/{event_id}/comments",
    response_model=EventCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_comment(
    calendar_id: int,
    event_id: int,
    data: EventCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_comment(db, calendar_id, event_id, current_user.id, data)


@router.get(
    "/{calendar_id}/events/{event_id}/comments",
    response_model=list[EventCommentResponse],
)
def list_comments(
    calendar_id: int,
    event_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_comments(db, calendar_id, event_id, current_user.id, limit=limit, offset=offset)


@router.patch(
    "/{calendar_id}/events/{event_id}/comments/{comment_id}",
    response_model=EventCommentResponse,
)
def update_comment(
    calendar_id: int,
    event_id: int,
    comment_id: int,
    data: EventCommentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_comment(db, calendar_id, event_id, comment_id, current_user.id, data)


@router.delete(
    "/{calendar_id}/events/{event_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_comment(
    calendar_id: int,
    event_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_comment(db, calendar_id, event_id, comment_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Workspace associations (Phase 3)
# ---------------------------------------------------------------------------


@router.get("/{calendar_id}/events/{event_id}/workspaces")
def list_event_workspaces(
    calendar_id: int,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"workspace_ids": service.list_event_workspaces(db, current_user.id, calendar_id, event_id)}


@router.post("/{calendar_id}/events/{event_id}/workspaces/{workspace_id}", status_code=status.HTTP_201_CREATED)
def attach_event_to_workspace(
    calendar_id: int,
    event_id: int,
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.attach_event_to_workspace(db, current_user.id, calendar_id, event_id, workspace_id)


@router.delete("/{calendar_id}/events/{event_id}/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def detach_event_from_workspace(
    calendar_id: int,
    event_id: int,
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.detach_event_from_workspace(db, current_user.id, calendar_id, event_id, workspace_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
