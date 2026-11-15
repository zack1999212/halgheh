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
    EventResponse,
    EventUpdate,
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
    return service.create_event(db, calendar_id, current_user.id, data)


@router.get("/{calendar_id}/events", response_model=list[EventResponse])
def list_events(
    calendar_id: int,
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    timezone: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_events(
        db,
        calendar_id,
        current_user.id,
        start=start,
        end=end,
        timezone=timezone,
    )


@router.get("/{calendar_id}/events/{event_id}", response_model=EventResponse)
def get_event(
    calendar_id: int,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_event(db, calendar_id, event_id, current_user.id)


@router.patch("/{calendar_id}/events/{event_id}", response_model=EventResponse)
def update_event(
    calendar_id: int,
    event_id: int,
    data: EventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_event(db, calendar_id, event_id, current_user.id, data)


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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_occurrences(
        db, calendar_id, current_user.id, start, end, timezone
    )
