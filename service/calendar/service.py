from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from dateutil.rrule import rrulestr
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import recurrence, repository, scheduling
from .models import Calendar, Event
from ..project import activity as project_activity
from ..project import permissions as project_permissions
from ..project import service as project_service
from .schemas import (
    ALLOWED_EVENT_CATEGORIES,
    CalendarCreate,
    CalendarUpdate,
    EventCreate,
    EventExceptionCreate,
    EventExceptionResponse,
    EventExceptionUpdate,
    EventUpdate,
    ReminderCreate,
    ReminderUpdate,
    OccurrenceResponse,
    EventCommentCreate,
    EventCommentUpdate,
)


def _calendar_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar not found")


def _event_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")


def _event_workspace_role(db: Session, event: Event, user_id: int) -> str | None:
    from ..workspace import repository as ws_repo
    from ..workspace import permissions as ws_permissions
    from ..docs.models import Workspace

    ws_ids = ws_repo.get_resource_workspace_ids(db, "event", event.id)
    if not ws_ids:
        return None
    best = None
    for ws_id in ws_ids:
        ws = db.get(Workspace, ws_id)
        if ws is None:
            continue
        member = ws_repo.get_member(db, ws_id, user_id)
        role = ws_permissions.workspace_role(ws, user_id, member.role if member else None)
        if ws_permissions.can_view(role):
            if best is None or role == "owner" or (role in ("admin", "editor") and best == "viewer"):
                best = role
    return best if best is not None else "none"


def _readable_event(db: Session, calendar_id: int, event_id: int, user_id: int) -> Event:
    event = repository.get_event_for_calendar(db, calendar_id, event_id)
    if event is None:
        raise _event_not_found()
    ws_role = _event_workspace_role(db, event, user_id)
    if ws_role is not None:
        from ..workspace import permissions as ws_permissions
        if ws_permissions.can_view(ws_role):
            return event
        raise _event_not_found()
    if event.project_id is None:
        calendar = db.get(Calendar, calendar_id)
        if calendar is None or calendar.user_id != user_id:
            raise _event_not_found()
    else:
        project_service.require_project_view(db, user_id, event.project_id)
    return event


def _managed_event(db: Session, calendar_id: int, event_id: int, user_id: int) -> Event:
    event = repository.get_event_for_calendar(db, calendar_id, event_id)
    if event is None:
        raise _event_not_found()
    ws_role = _event_workspace_role(db, event, user_id)
    if ws_role is not None:
        from ..workspace import permissions as ws_permissions
        if not ws_permissions.can_view(ws_role):
            raise _event_not_found()
        if ws_permissions.can_manage_content(ws_role):
            return event
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to modify this event")
    if event.project_id is None:
        calendar = db.get(Calendar, calendar_id)
        if calendar is None or calendar.user_id != user_id:
            raise _event_not_found()
    else:
        project_service.require_project_manage(db, user_id, event.project_id)
    return event


# Backward-compatible alias for existing internal use
def _not_found() -> HTTPException:
    return _calendar_not_found()


logger = logging.getLogger("halgheh.calendar")


def _reschedule_event_reminders(db: Session, *events) -> None:
    """Recompute pending reminders for one or more events.

    Only called once the owning change is committed: the reminder worker
    reconciles every event on each cycle, so a scheduling failure is logged and
    left to that sweep rather than failing the request or being swallowed.
    """
    try:
        for event in events:
            scheduling.invalidate_future_pending_for_event(db, event.id)
        # The session runs with autoflush disabled, so the deletions must be
        # flushed here: otherwise the re-insert conflicts with the rows that
        # are still present and matches them with ON CONFLICT DO NOTHING,
        # leaving the event with no pending reminders at all.
        db.flush()
        for event in events:
            scheduling.schedule_event_reminders(db, event)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Could not reschedule reminders for event(s) %s",
            ", ".join(str(event.id) for event in events),
        )


def create_default_calendar(db: Session, user_id: int) -> Calendar:
    """Create the required default personal calendar for a user.

    The caller is responsible for transaction boundaries; this function only
    adds the calendar to the session.
    """
    calendar = Calendar(user_id=user_id, name="Personal", is_default=True)
    db.add(calendar)
    return calendar


# --- Calendar operations ---


def list_calendars(db: Session, user_id: int) -> list[Calendar]:
    return repository.list_for_user(db, user_id)


def get_calendar(db: Session, calendar_id: int, user_id: int) -> Calendar:
    calendar = repository.get_for_user(db, calendar_id, user_id)
    if calendar is None:
        raise _calendar_not_found()
    return calendar


def create_calendar(db: Session, user_id: int, data: CalendarCreate) -> Calendar:
    calendar = repository.create(
        db,
        user_id=user_id,
        name=data.name,
        description=data.description,
        color=data.color,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Could not create calendar"
        )
    db.refresh(calendar)
    return calendar


def update_calendar(
    db: Session, calendar_id: int, user_id: int, data: CalendarUpdate
) -> Calendar:
    calendar = repository.get_for_user(db, calendar_id, user_id)
    if calendar is None:
        raise _calendar_not_found()

    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(calendar, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Could not update calendar"
        )
    db.refresh(calendar)
    return calendar


def set_default_calendar(db: Session, calendar_id: int, user_id: int) -> Calendar:
    try:
        calendar = repository.get_for_user(db, calendar_id, user_id)
        if calendar is None:
            raise _calendar_not_found()

        if calendar.is_default:
            return calendar

        current_default = repository.get_current_default(db, user_id)
        if current_default is not None and current_default.id != calendar.id:
            current_default.is_default = False
        calendar.is_default = True

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not change default calendar",
        )
    db.refresh(calendar)
    return calendar


def delete_calendar(db: Session, calendar_id: int, user_id: int) -> None:
    calendar = repository.get_for_user(db, calendar_id, user_id)
    if calendar is None:
        raise _calendar_not_found()
    if calendar.is_default:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Default calendar cannot be deleted",
        )

    try:
        repository.delete(db, calendar)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Could not delete calendar"
        )


# --- Event operations ---


def _get_owned_calendar(db: Session, calendar_id: int, user_id: int) -> Calendar:
    calendar = repository.get_for_user(db, calendar_id, user_id)
    if calendar is None:
        # Do not reveal whether another user's calendar exists.
        raise _calendar_not_found()
    return calendar


def _resolve_event_workspace_id(db: Session, user_id: int, *, workspace_id: int | None, project_id: int | None) -> int:
    from ..workspace import service as ws_service
    from ..workspace import permissions as ws_permissions
    from ..workspace import repository as ws_repo
    from ..project.models import Project

    if workspace_id is not None:
        ws, role = ws_service.get_accessible_workspace(db, workspace_id, user_id)
        if not ws_permissions.can_create_resource(role):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to create resources in this workspace")
        if project_id is not None and ws.workspace_type == "shared":
            project = db.get(Project, project_id)
            if project is not None and project.workspace_id is not None and project.workspace_id != ws.id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id does not match the project workspace")
        return ws.id
    if project_id is not None:
        project = db.get(Project, project_id)
        if project is not None and project.workspace_id is not None:
            ws, role = ws_service.get_accessible_workspace(db, project.workspace_id, user_id)
            if not ws_permissions.can_create_resource(role):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to create resources in this workspace")
            return ws.id
    personal = ws_repo.get_personal_workspace_for_user(db, user_id)
    if personal is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Personal workspace not found")
    return personal.id


def create_event(db: Session, calendar_id: int, user_id: int, data: EventCreate) -> Event:
    _get_owned_calendar(db, calendar_id, user_id)
    if data.project_id is not None:
        project_service.require_project_manage(db, user_id, data.project_id)
    if data.recurrence_rule is not None:
        try:
            recurrence.validate_event_recurrence(
                is_all_day=data.is_all_day,
                start_at=data.start_at,
                end_at=data.end_at,
                start_date=data.start_date,
                end_date=data.end_date,
                timezone=data.timezone,
                recurrence_rule=data.recurrence_rule,
            )
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid recurrence rule")
    payload = data.model_dump()
    workspace_id = payload.pop("workspace_id", None)
    resolved_workspace_id = _resolve_event_workspace_id(db, user_id, workspace_id=workspace_id, project_id=data.project_id)
    event = repository.create_event(db, calendar_id, **payload)
    db.flush()
    from ..workspace import repository as ws_repo
    ws_repo.add_resource_workspace(db, "event", event.id, resolved_workspace_id)
    if event.project_id is not None:
        project_activity.record(
            db,
            project_id=event.project_id,
            actor_id=user_id,
            event_type=project_activity.CALENDAR_EVENT_CREATED,
            entity_type="calendar_event",
            entity_id=event.id,
            metadata={
                "event_id": event.id,
                "event_title": event.title,
            },
        )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Could not create event"
        )
    db.refresh(event)
    return event


def _validate_range_timezone(tz_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        raise HTTPException(
            status_code=422, detail="timezone must be a valid IANA timezone identifier"
        )


def _compute_local_date_bounds(
    start: datetime, end: datetime, tz: ZoneInfo
) -> tuple[date, date]:
    start_local = start.astimezone(tz)
    end_local = end.astimezone(tz)
    local_start_date = start_local.date()
    if end_local.timetz().replace(tzinfo=None) == time.min and end_local.time() == time.min:
        # Exactly midnight: exclusive end of the interval does not include this local day.
        local_end_date = end_local.date()
    else:
        local_end_date = end_local.date() + timedelta(days=1)
    return local_start_date, local_end_date


def _accessible_event_ids(
    db: Session,
    calendar: Calendar,
    events: list[Event],
    user_id: int,
    *,
    project_id: int | None = None,
    workspace_id: int | None = None,
) -> set[int]:
    """Resolve access for a batch of events with batched workspace queries.

    Raw associations and the actor's accessible workspaces are fetched once
    for the whole page; legacy project fallbacks reuse one role lookup per
    distinct project.
    """
    if not events:
        return set()
    from ..workspace import repository as ws_repo

    event_ids = list({event.id for event in events})
    raw_ws_ids = ws_repo.list_resource_workspace_ids_batch(db, "event", event_ids)
    accessible_ws = ws_repo.list_resource_workspaces_for_actor(
        db, "event", event_ids, user_id
    )

    project_roles: dict[int, str] = {}

    def _project_role(pid: int) -> str:
        if pid not in project_roles:
            project_roles[pid] = project_service.get_project_role(db, user_id, pid)
        return project_roles[pid]

    accessible: set[int] = set()
    for event in events:
        ws_ids = raw_ws_ids.get(event.id, [])
        if workspace_id is not None:
            if workspace_id in {w["id"] for w in accessible_ws.get(event.id, [])}:
                accessible.add(event.id)
            continue
        if ws_ids:
            if accessible_ws.get(event.id):
                accessible.add(event.id)
            continue
        # Legacy fallback only when no workspace associations exist.
        if project_id is None:
            if event.project_id is None and calendar.user_id == user_id:
                accessible.add(event.id)
        elif event.project_id == project_id and project_permissions.can_view(
            _project_role(event.project_id)
        ):
            accessible.add(event.id)
    return accessible


def list_events(
    db: Session,
    calendar_id: int,
    user_id: int,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    timezone: str | None = None,
    project_id: int | None = None,
    workspace_id: int | None = None,
) -> list[Event]:
    calendar = db.get(Calendar, calendar_id)
    if calendar is None:
        raise _calendar_not_found()

    if workspace_id is not None:
        from ..workspace import service as ws_service
        ws_service.get_accessible_workspace(db, workspace_id, user_id)
    elif project_id is not None:
        project_service.require_project_view(db, user_id, project_id)
    elif calendar.user_id != user_id:
        # Allow if user can access any workspace-associated event in this calendar;
        # _accessible will filter. Do not expose unrelated personal events.
        pass

    if start is None and end is None and timezone is None:
        events = repository.list_events_for_calendar(db, calendar_id)
    else:
        if (start is None) != (end is None):
            raise HTTPException(
                status_code=422, detail="Both start and end must be supplied together"
            )
        if start is None or end is None:
            # timezone supplied without range is not a supported query mode.
            raise HTTPException(
                status_code=422, detail="Both start and end must be supplied together"
            )

        if start.tzinfo is None or start.utcoffset() is None:
            raise HTTPException(status_code=422, detail="start must be timezone-aware")
        if end.tzinfo is None or end.utcoffset() is None:
            raise HTTPException(status_code=422, detail="end must be timezone-aware")
        if start >= end:
            raise HTTPException(status_code=422, detail="start must be earlier than end")

        if timezone is not None:
            tz = _validate_range_timezone(timezone)
        else:
            # Interpret using the timezone offset supplied by the timestamps.
            tz = start.tzinfo  # type: ignore[assignment]

        local_start_date, local_end_date = _compute_local_date_bounds(start, end, tz)
        start_utc = start.astimezone(ZoneInfo("UTC"))
        end_utc = end.astimezone(ZoneInfo("UTC"))

        events = repository.list_events_for_calendar_range(
            db,
            calendar_id,
            start=start_utc,
            end=end_utc,
            local_start_date=local_start_date,
            local_end_date=local_end_date,
        )

    accessible_ids = _accessible_event_ids(
        db,
        calendar,
        events,
        user_id,
        project_id=project_id,
        workspace_id=workspace_id,
    )
    result = [e for e in events if e.id in accessible_ids]
    if not result and calendar.user_id != user_id and workspace_id is None and project_id is None:
        # Hide personal calendar when no workspace-associated events are accessible.
        raise _calendar_not_found()
    if not result and calendar.user_id != user_id and project_id is not None and workspace_id is None:
        raise _calendar_not_found()
    return result


def get_event(db: Session, calendar_id: int, event_id: int, user_id: int) -> Event:
    return _readable_event(db, calendar_id, event_id, user_id)


def _validate_timed_values(start_at: datetime | None, end_at: datetime | None, timezone: str | None) -> None:
    if start_at is None or end_at is None or timezone is None:
        raise HTTPException(status_code=422, detail="Timed events must provide start_at, end_at, and timezone")
    if start_at.tzinfo is None or start_at.utcoffset() is None:
        raise HTTPException(status_code=422, detail="start_at must be timezone-aware")
    if end_at.tzinfo is None or end_at.utcoffset() is None:
        raise HTTPException(status_code=422, detail="end_at must be timezone-aware")
    if end_at <= start_at:
        raise HTTPException(status_code=422, detail="end_at must be later than start_at")
    try:
        ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        raise HTTPException(status_code=422, detail="timezone must be a valid IANA timezone identifier")


def _validate_allday_values(start_date: date | None, end_date: date | None) -> None:
    if start_date is None or end_date is None:
        raise HTTPException(status_code=422, detail="All-day events must provide start_date and end_date")
    if end_date <= start_date:
        raise HTTPException(status_code=422, detail="end_date must be later than start_date")


def _apply_event_update(event: Event, data: EventUpdate) -> None:
    updates = data.model_dump(exclude_unset=True)

    # Apply supplied fields to compute/validate resulting state.
    resulting = {
        "title": event.title,
        "description": event.description,
        "location": event.location,
        "is_all_day": event.is_all_day,
        "start_at": event.start_at,
        "end_at": event.end_at,
        "start_date": event.start_date,
        "end_date": event.end_date,
        "timezone": event.timezone,
        "recurrence_rule": event.recurrence_rule,
        "category": event.category,
    }
    resulting.update(updates)

    # Category cannot be null/unknown in resulting state.
    if resulting["category"] is None:
        raise HTTPException(status_code=422, detail="Category cannot be cleared")
    if resulting["category"] not in ALLOWED_EVENT_CATEGORIES:
        raise HTTPException(status_code=422, detail="Unknown event category")

    # Title cannot be null/empty in resulting state.
    if resulting["title"] is None or not str(resulting["title"]).strip():
        raise HTTPException(status_code=422, detail="Event title must not be empty")
    if isinstance(resulting["title"], str):
        resulting["title"] = resulting["title"].strip()

    if event.is_all_day:
        # Preserve valid all-day structure; reject timed fields/combinations.
        if any(
            f in updates
            for f in ("start_at", "end_at", "timezone")
        ):
            raise HTTPException(
                status_code=422,
                detail="All-day events must not provide start_at, end_at, or timezone",
            )
        if resulting["start_at"] is not None or resulting["end_at"] is not None or resulting["timezone"] is not None:
            raise HTTPException(
                status_code=422,
                detail="All-day events must not have start_at, end_at, or timezone",
            )
        _validate_allday_values(resulting["start_date"], resulting["end_date"])
    else:
        # Preserve valid timed-event structure; reject date-only fields/combinations.
        if any(f in updates for f in ("start_date", "end_date")):
            raise HTTPException(
                status_code=422,
                detail="Timed events must not provide start_date or end_date",
            )
        if resulting["start_date"] is not None or resulting["end_date"] is not None:
            raise HTTPException(
                status_code=422,
                detail="Timed events must not have start_date or end_date",
            )
        _validate_timed_values(resulting["start_at"], resulting["end_at"], resulting["timezone"])

    # Validate recurrence rule against the resulting event state, if present.
    if resulting.get("recurrence_rule") is not None:
        try:
            recurrence.validate_event_recurrence(
                is_all_day=resulting["is_all_day"],
                start_at=resulting["start_at"],
                end_at=resulting["end_at"],
                start_date=resulting["start_date"],
                end_date=resulting["end_date"],
                timezone=resulting["timezone"],
                recurrence_rule=resulting["recurrence_rule"],
            )
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid recurrence rule")

    # Persist validated resulting values for fields that may be updated.
    for field, value in updates.items():
        if field == "title":
            setattr(event, field, resulting["title"])
        else:
            setattr(event, field, value)


def _event_time_snapshot(event: Event) -> dict:
    if event.is_all_day:
        return {
            "is_all_day": True,
            "start_date": event.start_date.isoformat() if event.start_date else None,
            "end_date": event.end_date.isoformat() if event.end_date else None,
            "timezone": event.timezone,
        }
    return {
        "is_all_day": False,
        "start_at": event.start_at.isoformat() if event.start_at else None,
        "end_at": event.end_at.isoformat() if event.end_at else None,
        "timezone": event.timezone,
    }


def update_event(
    db: Session, calendar_id: int, event_id: int, user_id: int, data: EventUpdate
) -> Event:
    event = _managed_event(db, calendar_id, event_id, user_id)
    updates = data.model_dump(exclude_unset=True)
    old_project_id = event.project_id
    old_title = event.title
    old_time = _event_time_snapshot(event)

    project_changed = False
    if "project_id" in updates:
        new_project_id = updates.pop("project_id")
        if event.project_id is not None:
            project_service.require_project_manage(db, user_id, event.project_id)
        if new_project_id is not None:
            project_service.require_project_manage(db, user_id, new_project_id)
        if new_project_id != old_project_id:
            event.project_id = new_project_id
            project_changed = True

    meaningful_change = project_changed
    if updates:
        before = {
            f: getattr(event, f)
            for f in updates.keys()
        }
        eu = EventUpdate(**updates)
        _apply_event_update(event, eu)
        after = {
            f: getattr(event, f)
            for f in updates.keys()
        }
        if before != after:
            meaningful_change = True

    if meaningful_change:
        new_time = _event_time_snapshot(event)
        metadata = {
            "event_id": event.id,
            "event_title": event.title,
        }
        if old_time != new_time:
            metadata["previous_time"] = old_time
            metadata["new_time"] = new_time
        if old_title != event.title:
            metadata["previous_title"] = old_title
            metadata["new_title"] = event.title

        affected_project_ids: list[int] = []
        if old_project_id is not None:
            affected_project_ids.append(old_project_id)
        if event.project_id is not None and event.project_id not in affected_project_ids:
            affected_project_ids.append(event.project_id)
        for pid in affected_project_ids:
            project_activity.record(
                db,
                project_id=pid,
                actor_id=user_id,
                event_type=project_activity.CALENDAR_EVENT_UPDATED,
                entity_type="calendar_event",
                entity_id=event.id,
                metadata=metadata,
            )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Could not update event"
        )
    db.refresh(event)
    # Rescheduling runs in its own transaction: a reminder failure must neither
    # roll back the saved edit nor disappear without a trace.
    _reschedule_event_reminders(db, event)
    return event


def delete_event(db: Session, calendar_id: int, event_id: int, user_id: int) -> None:
    event = repository.get_event_for_calendar(db, calendar_id, event_id)
    if event is None:
        raise _event_not_found()
    # ensure user can see it; workspace associations are authoritative when present
    ws_role = _event_workspace_role(db, event, user_id)
    if ws_role is not None:
        from ..workspace import permissions as ws_permissions
        if not ws_permissions.can_view(ws_role):
            raise _event_not_found()
    else:
        # fallback to legacy readability
        if event.project_id is not None:
            project_service.require_project_view(db, user_id, event.project_id)
        else:
            calendar = db.get(Calendar, calendar_id)
            if calendar is None or calendar.user_id != user_id:
                raise _event_not_found()
    from ..workspace import service as ws_service
    if not ws_service.can_delete_resource_everywhere(db, user_id, "event", event):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to delete this event everywhere")
    try:
        repository.delete_event(db, event)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Could not delete event"
        )


# --- Occurrences ---

def _apply_timed_exception(event, exc, base_start, base_end):
    duration = base_end - base_start
    start = exc.start_at if exc.start_at is not None else base_start
    if exc.end_at is not None:
        end = exc.end_at
    else:
        end = start + duration
    return start, end


def _apply_allday_exception(event, exc, base_start_date, base_end_date):
    duration_days = (base_end_date - base_start_date).days
    start_date = exc.start_date if exc.start_date is not None else base_start_date
    if exc.end_date is not None:
        end_date = exc.end_date
    else:
        end_date = start_date + timedelta(days=duration_days)
    return start_date, end_date


def list_project_events(
    db: Session,
    project_id: int,
    user_id: int,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    timezone: str | None = None,
    workspace_id: int | None = None,
) -> list[Event]:
    """Events associated with ``project_id``, readable by an accepted member.

    Project events live in their creator's calendar, so this query is scoped by
    project membership rather than by calendar ownership and never returns
    personal events from those calendars.
    """
    project_service.require_project_view(db, user_id, project_id)
    if workspace_id is not None:
        from ..workspace import service as ws_service
        ws_service.get_accessible_workspace(db, workspace_id, user_id)
    events = repository.list_events_for_project(db, project_id)

    from ..workspace import repository as ws_repo
    filtered = []
    for event in events:
        ws_ids = ws_repo.get_resource_workspace_ids(db, "event", event.id)
        if workspace_id is not None:
            if workspace_id not in ws_ids:
                continue
            if _event_workspace_role(db, event, user_id) in (None, "none"):
                continue
            filtered.append(event)
            continue
        if ws_ids:
            if _event_workspace_role(db, event, user_id) not in (None, "none"):
                filtered.append(event)
            continue
        # legacy fallback
        filtered.append(event)
    events = filtered

    if start is None and end is None and timezone is None:
        return events
    if start is None or end is None:
        raise HTTPException(
            status_code=422, detail="Both start and end must be supplied together"
        )
    if start.tzinfo is None or start.utcoffset() is None:
        raise HTTPException(status_code=422, detail="start must be timezone-aware")
    if end.tzinfo is None or end.utcoffset() is None:
        raise HTTPException(status_code=422, detail="end must be timezone-aware")
    if start >= end:
        raise HTTPException(status_code=422, detail="start must be earlier than end")

    if timezone is not None:
        tz = _validate_range_timezone(timezone)
    else:
        tz = start.tzinfo  # type: ignore[assignment]
    local_start_date, local_end_date = _compute_local_date_bounds(start, end, tz)
    start_utc = start.astimezone(ZoneInfo("UTC"))
    end_utc = end.astimezone(ZoneInfo("UTC"))

    result = []
    for event in events:
        if event.is_all_day:
            overlaps = event.start_date < local_end_date and event.end_date > local_start_date
        else:
            overlaps = event.start_at < end_utc and event.end_at > start_utc
        # Recurring events have no single interval; range filtering is done by
        # the occurrence expansion endpoint.
        if event.recurrence_rule is not None or overlaps:
            result.append(event)
    return result


def _validate_occurrence_window(
    start: datetime, end: datetime, timezone_name: str
) -> tuple[ZoneInfo, date, date]:
    tz = _validate_range_timezone(timezone_name)

    if start.tzinfo is None or start.utcoffset() is None:
        raise HTTPException(status_code=422, detail="start must be timezone-aware")
    if end.tzinfo is None or end.utcoffset() is None:
        raise HTTPException(status_code=422, detail="end must be timezone-aware")
    if start >= end:
        raise HTTPException(status_code=422, detail="start must be earlier than end")
    if (end - start) > timedelta(days=366):
        raise HTTPException(status_code=422, detail="Requested range must not exceed one year")

    local_start_date, local_end_date = _compute_local_date_bounds(start, end, tz)
    return tz, local_start_date, local_end_date


def _accessible_event(
    db: Session,
    calendar: Calendar,
    event: Event,
    user_id: int,
    project_id: int | None = None,
    workspace_id: int | None = None,
) -> bool:
    """Event access for occurrence expansion."""
    from ..workspace import repository as ws_repo
    ws_ids = ws_repo.get_resource_workspace_ids(db, "event", event.id)
    if workspace_id is not None:
        return workspace_id in ws_ids and _event_workspace_role(db, event, user_id) not in (None, "none")
    if ws_ids:
        return _event_workspace_role(db, event, user_id) not in (None, "none")
    # legacy fallback only when no workspace associations
    if project_id is None:
        return event.project_id is None and calendar.user_id == user_id
    if event.project_id is None or event.project_id != project_id:
        return False
    return project_permissions.can_view(
        project_service.get_project_role(db, user_id, event.project_id)
    )


def _has_accessible_event(
    db: Session, calendar: Calendar, user_id: int, project_id: int | None = None
) -> bool:
    if calendar.user_id == user_id:
        return True
    for candidate_project_id in repository.list_project_ids_for_calendar(db, calendar.id):
        if project_id is not None and candidate_project_id != project_id:
            continue
        if project_permissions.can_view(
            project_service.get_project_role(db, user_id, candidate_project_id)
        ):
            return True
    return False


def list_occurrences(
    db: Session,
    calendar_id: int,
    user_id: int,
    start: datetime,
    end: datetime,
    timezone_name: str,
    project_id: int | None = None,
    workspace_id: int | None = None,
) -> list[OccurrenceResponse]:
    calendar = db.get(Calendar, calendar_id)
    if calendar is None:
        raise _calendar_not_found()

    if workspace_id is not None:
        from ..workspace import service as ws_service
        ws_service.get_accessible_workspace(db, workspace_id, user_id)
    elif project_id is not None:
        project_service.require_project_view(db, user_id, project_id)

    tz, local_start_date, local_end_date = _validate_occurrence_window(
        start, end, timezone_name
    )

    if project_id is not None and workspace_id is None and not _has_accessible_event(db, calendar, user_id, project_id):
        # Hide another user's personal calendar from callers who receive no
        # project events from it.
        raise _calendar_not_found()
    if project_id is None and workspace_id is None and calendar.user_id != user_id:
        # Allow workspace-associated events; _expand filters by access.
        pass

    results = _expand_calendar_occurrences(
        db,
        calendar,
        user_id,
        start=start,
        end=end,
        tz=tz,
        local_start_date=local_start_date,
        local_end_date=local_end_date,
        project_id=project_id,
        workspace_id=workspace_id,
    )
    if not results and calendar.user_id != user_id and workspace_id is None and project_id is None:
        raise _calendar_not_found()
    return results


def list_accessible_occurrences(
    db: Session,
    user_id: int,
    start: datetime,
    end: datetime,
    timezone_name: str,
    workspace_id: int | None = None,
) -> list[OccurrenceResponse]:
    """Expanded occurrences for all events accessible to the user.

    Discovery is based on authorized workspace associations (and legacy
    owner/project fallback inside expansion access checks), not on calendar
    ownership enumeration alone.
    """
    if workspace_id is not None:
        from ..workspace import service as ws_service

        ws_service.get_accessible_workspace(db, workspace_id, user_id)

    tz, local_start_date, local_end_date = _validate_occurrence_window(
        start, end, timezone_name
    )

    from sqlalchemy import select
    from ..workspace import repository as ws_repo

    accessible_ws_ids = ws_repo.list_accessible_workspace_ids(db, user_id)
    candidate_calendar_ids: set[int] = {
        cal.id for cal in repository.list_for_user(db, user_id)
    }
    candidate_calendar_ids.update(
        repository.list_calendar_ids_for_workspace_ids(db, list(accessible_ws_ids))
    )

    if not candidate_calendar_ids:
        return []

    calendars = list(
        db.scalars(select(Calendar).where(Calendar.id.in_(candidate_calendar_ids))).all()
    )
    calendars_by_id = {cal.id: cal for cal in calendars}

    merged: list[OccurrenceResponse] = []
    seen: set[tuple] = set()
    for calendar_id in sorted(candidate_calendar_ids):
        calendar = calendars_by_id.get(calendar_id)
        if calendar is None:
            continue
        expanded = _expand_calendar_occurrences(
            db,
            calendar,
            user_id,
            start=start,
            end=end,
            tz=tz,
            local_start_date=local_start_date,
            local_end_date=local_end_date,
            workspace_id=workspace_id,
        )
        for occ in expanded:
            key = (
                occ.event_id,
                occ.original_start_at,
                occ.original_start_date,
                occ.start_at,
                occ.start_date,
                occ.end_at,
                occ.end_date,
            )
            if key in seen:
                continue
            seen.add(key)
            merged.append(occ)
            if len(merged) > recurrence.MAX_OCCURRENCES:
                raise HTTPException(
                    status_code=422,
                    detail="Occurrence expansion exceeded the maximum of 5000",
                )

    return _sort_occurrences(merged, tz)


def list_project_occurrences(
    db: Session,
    project_id: int,
    user_id: int,
    start: datetime,
    end: datetime,
    timezone_name: str,
    workspace_id: int | None = None,
) -> list[OccurrenceResponse]:
    """Expanded occurrences of every event associated with a project.

    Spans the calendars that hold project events without granting access to
    the creators' private calendars or to their personal events.
    """
    project_service.require_project_view(db, user_id, project_id)
    if workspace_id is not None:
        from ..workspace import service as ws_service
        ws_service.get_accessible_workspace(db, workspace_id, user_id)
    tz, local_start_date, local_end_date = _validate_occurrence_window(
        start, end, timezone_name
    )

    merged: list[OccurrenceResponse] = []
    for calendar_id in repository.list_calendar_ids_for_project(db, project_id):
        calendar = db.get(Calendar, calendar_id)
        if calendar is None:
            continue
        merged.extend(
            _expand_calendar_occurrences(
                db,
                calendar,
                user_id,
                start=start,
                end=end,
                tz=tz,
                local_start_date=local_start_date,
                local_end_date=local_end_date,
                project_id=project_id,
                workspace_id=workspace_id,
            )
        )
        if len(merged) > recurrence.MAX_OCCURRENCES:
            raise HTTPException(
                status_code=422,
                detail="Occurrence expansion exceeded the maximum of 5000",
            )

    return _sort_occurrences(merged, tz)


def _expand_calendar_occurrences(
    db: Session,
    calendar: Calendar,
    user_id: int,
    *,
    start: datetime,
    end: datetime,
    tz: ZoneInfo,
    local_start_date: date,
    local_end_date: date,
    project_id: int | None = None,
    workspace_id: int | None = None,
) -> list[OccurrenceResponse]:
    calendar_id = calendar.id

    nonrec_timed_all = repository.list_nonrecurring_timed_overlapping(
        db, calendar_id, start=start, end=end
    )
    nonrec_allday_all = repository.list_nonrecurring_allday_overlapping(
        db, calendar_id, local_start_date=local_start_date, local_end_date=local_end_date
    )
    recurring_all = repository.list_recurring_events_for_calendar(db, calendar_id)

    accessible_ids = _accessible_event_ids(
        db,
        calendar,
        [*nonrec_timed_all, *nonrec_allday_all, *recurring_all],
        user_id,
        project_id=project_id,
        workspace_id=workspace_id,
    )

    def _event_in_scope(e: Event) -> bool:
        return e.id in accessible_ids

    nonrec_timed = [e for e in nonrec_timed_all if _event_in_scope(e)]
    nonrec_allday = [e for e in nonrec_allday_all if _event_in_scope(e)]
    recurring_events = [e for e in recurring_all if _event_in_scope(e)]

    recurring_ids = [e.id for e in recurring_events]
    exceptions = repository.list_exceptions_for_events(db, recurring_ids)
    exceptions_by_event: dict[int, list] = {}
    for ex in exceptions:
        exceptions_by_event.setdefault(ex.event_id, []).append(ex)

    results: list[OccurrenceResponse] = []

    def _add(occ: OccurrenceResponse):
        nonlocal results
        if len(results) >= recurrence.MAX_OCCURRENCES:
            raise HTTPException(status_code=422, detail="Occurrence expansion exceeded the maximum of 5000")
        results.append(occ)

    # Non-recurring timed.
    for event in nonrec_timed:
        occ_start = event.start_at
        occ_end = event.end_at
        if occ_start < end and occ_end > start:
            _add(
                OccurrenceResponse(
                    event_id=event.id,
                    title=event.title,
                    description=event.description,
                    is_all_day=False,
                    start_at=occ_start,
                    end_at=occ_end,
                    start_date=None,
                    end_date=None,
                    timezone=event.timezone,
                    original_start_at=None,
                    original_start_date=None,
                    is_recurring=False,
                    is_exception=False,
                    category=event.category,
                    project_id=event.project_id,
                )
            )

    # Non-recurring all-day.
    for event in nonrec_allday:
        if event.start_date < local_end_date and event.end_date > local_start_date:
            _add(
                OccurrenceResponse(
                    event_id=event.id,
                    title=event.title,
                    description=event.description,
                    is_all_day=True,
                    start_at=None,
                    end_at=None,
                    start_date=event.start_date,
                    end_date=event.end_date,
                    timezone=event.timezone,
                    original_start_at=None,
                    original_start_date=None,
                    is_recurring=False,
                    is_exception=False,
                    category=event.category,
                    project_id=event.project_id,
                )
            )

    # Recurring events.
    for event in recurring_events:
        event_excs = exceptions_by_event.get(event.id, [])
        exc_map = {}
        for ex in event_excs:
            key = ex.original_start_at if ex.original_start_at is not None else ex.original_start_date
            exc_map[key] = ex

        handled_keys: set = set()
        duration_days = 0

        if event.is_all_day:
            try:
                base_occs = recurrence.generate_allday_occurrences(
                    event, local_start_date=local_start_date, local_end_date=local_end_date
                )
            except ValueError:
                raise HTTPException(status_code=422, detail="Occurrence expansion exceeded limits")
            duration_days = (event.end_date - event.start_date).days
            for occ_start_date, occ_end_date, orig_key in base_occs:
                exc = exc_map.get(orig_key)
                if exc is not None:
                    handled_keys.add(orig_key)
                    if exc.is_cancelled:
                        continue
                    new_start_date, new_end_date = _apply_allday_exception(
                        event, exc, occ_start_date, occ_end_date
                    )
                    # Overlap check.
                    if not (new_start_date < local_end_date and new_end_date > local_start_date):
                        continue
                    _add(
                        OccurrenceResponse(
                            event_id=event.id,
                            title=exc.title if exc.title is not None else event.title,
                            description=exc.description if exc.description is not None else event.description,
                            is_all_day=True,
                            start_at=None,
                            end_at=None,
                            start_date=new_start_date,
                            end_date=new_end_date,
                            timezone=event.timezone,
                            original_start_at=None,
                            original_start_date=orig_key if isinstance(orig_key, date) else None,
                            is_recurring=True,
                            is_exception=True,
                            category=event.category,
                            project_id=event.project_id,
                        )
                    )
                else:
                    if occ_start_date < local_end_date and occ_end_date > local_start_date:
                        _add(
                            OccurrenceResponse(
                                event_id=event.id,
                                title=event.title,
                                description=event.description,
                                is_all_day=True,
                                start_at=None,
                                end_at=None,
                                start_date=occ_start_date,
                                end_date=occ_end_date,
                                timezone=event.timezone,
                                original_start_at=None,
                                original_start_date=orig_key if isinstance(orig_key, date) else None,
                                is_recurring=True,
                                is_exception=False,
                                category=event.category,
                                project_id=event.project_id,
                            )
                        )
        else:
            try:
                base_occs = recurrence.generate_timed_occurrences(
                    event, range_start=start, range_end=end
                )
            except ValueError:
                raise HTTPException(status_code=422, detail="Occurrence expansion exceeded limits")
            for occ_start, occ_end, orig_key in base_occs:
                exc = exc_map.get(orig_key)
                if exc is not None:
                    handled_keys.add(orig_key)
                    if exc.is_cancelled:
                        continue
                    new_start, new_end = _apply_timed_exception(event, exc, occ_start, occ_end)
                    if not (new_start < end and new_end > start):
                        continue
                    _add(
                        OccurrenceResponse(
                            event_id=event.id,
                            title=exc.title if exc.title is not None else event.title,
                            description=exc.description if exc.description is not None else event.description,
                            is_all_day=False,
                            start_at=new_start,
                            end_at=new_end,
                            start_date=None,
                            end_date=None,
                            timezone=event.timezone,
                            original_start_at=orig_key if isinstance(orig_key, datetime) else None,
                            original_start_date=None,
                            is_recurring=True,
                            is_exception=True,
                            category=event.category,
                            project_id=event.project_id,
                        )
                    )
                else:
                    if occ_start < end and occ_end > start:
                        _add(
                            OccurrenceResponse(
                                event_id=event.id,
                                title=event.title,
                                description=event.description,
                                is_all_day=False,
                                start_at=occ_start,
                                end_at=occ_end,
                                start_date=None,
                                end_date=None,
                                timezone=event.timezone,
                                original_start_at=orig_key if isinstance(orig_key, datetime) else None,
                                original_start_date=None,
                                is_recurring=True,
                                is_exception=False,
                                category=event.category,
                                project_id=event.project_id,
                            )
                        )

        # Exceptions that move into range (original outside generated set).
        for exc in event_excs:
            if exc.is_cancelled:
                continue
            orig_key = exc.original_start_at if exc.original_start_at is not None else exc.original_start_date
            if orig_key in handled_keys:
                continue
            # Only consider overrides (if no override fields, nothing to move).
            if event.is_all_day:
                if exc.start_date is None and exc.end_date is None and exc.title is None and exc.description is None:
                    continue
                # base occurrence dates from original key
                if not isinstance(orig_key, date):
                    continue
                base_start_date = orig_key
                base_end_date = orig_key + timedelta(days=duration_days)
                new_start_date, new_end_date = _apply_allday_exception(event, exc, base_start_date, base_end_date)
                if not (new_start_date < local_end_date and new_end_date > local_start_date):
                    continue
                _add(
                    OccurrenceResponse(
                        event_id=event.id,
                        title=exc.title if exc.title is not None else event.title,
                        description=exc.description if exc.description is not None else event.description,
                        is_all_day=True,
                        start_at=None,
                        end_at=None,
                        start_date=new_start_date,
                        end_date=new_end_date,
                        timezone=event.timezone,
                        original_start_at=None,
                        original_start_date=orig_key if isinstance(orig_key, date) else None,
                        is_recurring=True,
                        is_exception=True,
                        category=event.category,
                        project_id=event.project_id,
                    )
                )
            else:
                if exc.start_at is None and exc.end_at is None and exc.title is None and exc.description is None:
                    continue
                if not isinstance(orig_key, datetime):
                    continue
                base_start = orig_key
                # ensure tz-aware in event tz
                if base_start.tzinfo is None:
                    base_start = base_start.replace(tzinfo=ZoneInfo(event.timezone))
                else:
                    base_start = base_start.astimezone(ZoneInfo(event.timezone))
                base_end = base_start + (event.end_at - event.start_at)
                new_start, new_end = _apply_timed_exception(event, exc, base_start, base_end)
                if not (new_start < end and new_end > start):
                    continue
                _add(
                    OccurrenceResponse(
                        event_id=event.id,
                        title=exc.title if exc.title is not None else event.title,
                        description=exc.description if exc.description is not None else event.description,
                        is_all_day=False,
                        start_at=new_start,
                        end_at=new_end,
                        start_date=None,
                        end_date=None,
                        timezone=event.timezone,
                        original_start_at=orig_key if isinstance(orig_key, datetime) else None,
                        original_start_date=None,
                        is_recurring=True,
                        is_exception=True,
                        category=event.category,
                        project_id=event.project_id,
                    )
                )

    for occ in results:
        occ.calendar_id = calendar_id
    return _sort_occurrences(results, tz)


def _sort_occurrences(
    results: list[OccurrenceResponse], tz: ZoneInfo
) -> list[OccurrenceResponse]:
    """Sort deterministically by effective start instant, then stable
    tie-breakers."""

    def _effective_start(o: OccurrenceResponse) -> datetime:
        if o.is_all_day:
            return datetime.combine(o.start_date, time.min, tzinfo=tz)
        # Normalize aware timed datetimes to the requested display timezone for comparison.
        if o.start_at.tzinfo is None:
            return o.start_at.replace(tzinfo=tz)
        return o.start_at.astimezone(tz)

    def _sort_key(o: OccurrenceResponse):
        orig = o.original_start_at if o.original_start_at is not None else o.original_start_date
        return (_effective_start(o), o.event_id, str(orig) if orig is not None else "")

    results.sort(key=_sort_key)
    return results


# --- Event exceptions ---


def _validate_exception_type_fields(event, data_dict):
    if event.is_all_day:
        if data_dict.get("start_at") is not None or data_dict.get("end_at") is not None:
            raise HTTPException(status_code=422, detail="Timed override fields are not allowed for all-day events")
    else:
        if data_dict.get("start_date") is not None or data_dict.get("end_date") is not None:
            raise HTTPException(status_code=422, detail="All-day override fields are not allowed for timed events")


def list_exceptions(db, calendar_id, event_id, user_id):
    event = _readable_event(db, calendar_id, event_id, user_id)
    if event.recurrence_rule is None:
        raise HTTPException(status_code=422, detail="Event is not recurring")
    excs = repository.list_exceptions_for_event(db, event_id)
    return excs


def get_exception(db, calendar_id, event_id, exception_id, user_id):
    _readable_event(db, calendar_id, event_id, user_id)
    exc = repository.get_exception_for_event(db, event_id, exception_id)
    if exc is None:
        raise HTTPException(status_code=404, detail="Exception not found")
    return exc


def create_exception(db, calendar_id, event_id, user_id, data: EventExceptionCreate):
    event = _managed_event(db, calendar_id, event_id, user_id)
    if event.recurrence_rule is None:
        raise HTTPException(status_code=422, detail="Event is not recurring")

    if event.is_all_day:
        if data.original_start_date is None or data.original_start_at is not None:
            raise HTTPException(status_code=422, detail="All-day events require original_start_date")
        original = data.original_start_date
    else:
        if data.original_start_at is None or data.original_start_date is not None:
            raise HTTPException(status_code=422, detail="Timed events require original_start_at")
        original = data.original_start_at

    if not recurrence.is_valid_occurrence(event, original):
        raise HTTPException(status_code=422, detail="Original occurrence is not generated by this event")

    payload = data.model_dump()
    _validate_exception_type_fields(event, payload)

    # Validate timed override ranges.
    if not event.is_all_day:
        if (payload.get("start_at") is not None) or (payload.get("end_at") is not None):
            if payload.get("start_at") is None or payload.get("end_at") is None:
                raise HTTPException(status_code=422, detail="Both start_at and end_at must be provided")
            if payload["start_at"].tzinfo is None or payload["start_at"].utcoffset() is None:
                raise HTTPException(status_code=422, detail="start_at must be timezone-aware")
            if payload["end_at"].tzinfo is None or payload["end_at"].utcoffset() is None:
                raise HTTPException(status_code=422, detail="end_at must be timezone-aware")
            if payload["end_at"] <= payload["start_at"]:
                raise HTTPException(status_code=422, detail="end_at must be later than start_at")
    else:
        if (payload.get("start_date") is not None) or (payload.get("end_date") is not None):
            if payload.get("start_date") is None or payload.get("end_date") is None:
                raise HTTPException(status_code=422, detail="Both start_date and end_date must be provided")
            if payload["end_date"] <= payload["start_date"]:
                raise HTTPException(status_code=422, detail="end_date must be later than start_date")

    # Duplicate check.
    existing = repository.get_exception_by_original(
        db,
        event.id,
        original_start_at=original if not event.is_all_day else None,
        original_start_date=original if event.is_all_day else None,
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="Exception already exists for this occurrence")

    create_data = {
        "event_id": event.id,
        "original_start_at": original if not event.is_all_day else None,
        "original_start_date": original if event.is_all_day else None,
        "is_cancelled": data.is_cancelled,
        "title": data.title,
        "description": data.description,
        "start_at": data.start_at,
        "end_at": data.end_at,
        "start_date": data.start_date,
        "end_date": data.end_date,
    }
    exc = repository.create_exception(db, **create_data)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Exception already exists for this occurrence")
    db.refresh(exc)
    _reschedule_event_reminders(db, event)
    return exc


def update_exception(db, calendar_id, event_id, exception_id, user_id, data: EventExceptionUpdate):
    event = _managed_event(db, calendar_id, event_id, user_id)
    exc = repository.get_exception_for_event(db, event_id, exception_id)
    if exc is None:
        raise HTTPException(status_code=404, detail="Exception not found")

    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="Update body must not be empty")

    _validate_exception_type_fields(event, updates)

    # Validate resulting timed ranges if provided.
    if not event.is_all_day:
        if ("start_at" in updates) or ("end_at" in updates):
            new_start = updates.get("start_at", exc.start_at)
            new_end = updates.get("end_at", exc.end_at)
            if new_start is not None and new_end is not None:
                if new_start.tzinfo is None or new_start.utcoffset() is None:
                    raise HTTPException(status_code=422, detail="start_at must be timezone-aware")
                if new_end.tzinfo is None or new_end.utcoffset() is None:
                    raise HTTPException(status_code=422, detail="end_at must be timezone-aware")
                if new_end <= new_start:
                    raise HTTPException(status_code=422, detail="end_at must be later than start_at")
    else:
        if ("start_date" in updates) or ("end_date" in updates):
            new_start = updates.get("start_date", exc.start_date)
            new_end = updates.get("end_date", exc.end_date)
            if new_start is not None and new_end is not None:
                if new_end <= new_start:
                    raise HTTPException(status_code=422, detail="end_date must be later than start_date")

    # Apply updates.
    for field, value in updates.items():
        setattr(exc, field, value)

    # If becoming cancelled, clear override fields not explicitly provided.
    if updates.get("is_cancelled") is True:
        for f in ("title", "description", "start_at", "end_at", "start_date", "end_date"):
            if f not in updates:
                setattr(exc, f, None)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not update exception")
    db.refresh(exc)
    _reschedule_event_reminders(db, event)
    return exc


def delete_exception(db, calendar_id, event_id, exception_id, user_id):
    event = _managed_event(db, calendar_id, event_id, user_id)
    exc = repository.get_exception_for_event(db, event_id, exception_id)
    if exc is None:
        raise HTTPException(status_code=404, detail="Exception not found")
    try:
        repository.delete_exception(db, exc)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not delete exception")
    _reschedule_event_reminders(db, event)


# --- Occurrence editing (Phase 3.3) ---


def _parse_rrule_params(rule: str) -> dict:
    params = {}
    for part in rule.split(";"):
        if not part.strip():
            continue
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        params[key.strip().upper()] = value.strip()
    return params


def _format_rrule_params(params: dict) -> str:
    # Keep FREQ first if present.
    ordered = {}
    if "FREQ" in params:
        ordered["FREQ"] = params["FREQ"]
    for k, v in params.items():
        if k != "FREQ":
            ordered[k] = v
    return ";".join(f"{k}={v}" for k, v in ordered.items())


def _count_before_selected(event, selected) -> int:
    if event.is_all_day:
        dtstart = event.start_date
        sel = selected if not isinstance(selected, datetime) else selected.date()
        if sel <= dtstart:
            return 0
        try:
            rr = rrulestr(event.recurrence_rule, dtstart=dtstart)
        except Exception:
            raise HTTPException(status_code=422, detail="Invalid recurrence rule")
        before = rr.between(
            datetime.combine(dtstart, time.min) if isinstance(dtstart, date) else dtstart,
            datetime.combine(sel, time.min) if isinstance(sel, date) else sel,
            inc=False,
        )
        return len(before) + 1
    else:
        try:
            tz = ZoneInfo(event.timezone)
        except Exception:
            raise HTTPException(status_code=422, detail="Invalid timezone")
        dtstart = event.start_at.astimezone(tz)
        sel = selected.astimezone(tz) if isinstance(selected, datetime) else selected
        if sel <= dtstart:
            return 0
        try:
            rr = rrulestr(event.recurrence_rule, dtstart=dtstart)
        except Exception:
            raise HTTPException(status_code=422, detail="Invalid recurrence rule")
        before = rr.between(dtstart, sel, inc=False)
        return len(before) + 1


def edit_occurrence(db, calendar_id, event_id, user_id, data):
    event = _managed_event(db, calendar_id, event_id, user_id)
    if event.recurrence_rule is None:
        raise HTTPException(status_code=422, detail="Event is not recurring")

    # Determine original identity and validate type.
    if event.is_all_day:
        if data.original_start_date is None or data.original_start_at is not None:
            raise HTTPException(status_code=422, detail="All-day events require original_start_date")
        original = data.original_start_date
    else:
        if data.original_start_at is None or data.original_start_date is not None:
            raise HTTPException(status_code=422, detail="Timed events require original_start_at")
        original = data.original_start_at

    if not recurrence.is_valid_occurrence(event, original):
        raise HTTPException(status_code=422, detail="Original occurrence is not generated by this event")

    updates = data.model_dump(exclude_unset=True)
    updates.pop("scope", None)
    updates.pop("original_start_at", None)
    updates.pop("original_start_date", None)

    scope = data.scope

    if scope == "occurrence":
        # Only exception-supported fields.
        supported = {"title", "description", "start_at", "end_at", "start_date", "end_date"}
        if not set(updates).issubset(supported):
            raise HTTPException(status_code=422, detail="Unsupported fields for occurrence scope")
        if not updates:
            raise HTTPException(status_code=422, detail="Update payload must not be empty")

        existing = repository.get_exception_by_original(
            db,
            event.id,
            original_start_at=original if not event.is_all_day else None,
            original_start_date=original if event.is_all_day else None,
        )
        if existing is not None:
            upd = EventExceptionUpdate(is_cancelled=False, **updates)
            exc = update_exception(db, calendar_id, event_id, existing.id, user_id, upd)
        else:
            create_data = EventExceptionCreate(
                original_start_at=original if not event.is_all_day else None,
                original_start_date=original if event.is_all_day else None,
                is_cancelled=False,
                **updates,
            )
            exc = create_exception(db, calendar_id, event_id, user_id, create_data)
        return {
            "scope": "occurrence",
            "event": event,
            "original_event": None,
            "new_event": None,
            "split_at": original,
        }

    if scope == "series":
        # Exception preservation policy.
        exceptions_exist = bool(repository.list_exceptions_for_event(db, event.id))
        risky = set(updates) & {"start_at", "end_at", "start_date", "end_date", "timezone", "recurrence_rule"}
        if risky and exceptions_exist:
            raise HTTPException(
                status_code=409,
                detail="Existing exceptions must be resolved before changing series timing or recurrence",
            )

        if "project_id" in updates:
            new_project_id = updates.pop("project_id")
            if event.project_id is not None:
                project_service.require_project_manage(db, user_id, event.project_id)
            if new_project_id is not None:
                project_service.require_project_manage(db, user_id, new_project_id)
            event.project_id = new_project_id
        if updates:
            eu = EventUpdate(**updates)
            _apply_event_update(event, eu)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="Could not update event")
        _reschedule_event_reminders(db, event)
        db.refresh(event)
        return {
            "scope": "series",
            "event": event,
            "original_event": None,
            "new_event": None,
            "split_at": original,
        }

    if scope == "following":
        # Only safe fields for future series.
        allowed = {"title", "description", "location", "recurrence_rule", "project_id"}
        if not set(updates).issubset(allowed):
            raise HTTPException(
                status_code=422,
                detail="Only title, description, location, and recurrence_rule may be changed for following scope",
            )

        # Compute split rules.
        params = _parse_rrule_params(event.recurrence_rule)
        if "FREQ" not in params:
            raise HTTPException(status_code=422, detail="Cannot split: invalid recurrence rule")

        count_before = _count_before_selected(event, original)

        # Original series: stop before selected.
        orig_params = dict(params)
        orig_params.pop("COUNT", None)
        if event.is_all_day:
            sel_date = original if not isinstance(original, datetime) else original.date()
            until_date = sel_date - timedelta(days=1)
            orig_params["UNTIL"] = until_date.strftime("%Y%m%d")
        else:
            sel_dt = original
            try:
                tz = ZoneInfo(event.timezone)
            except Exception:
                raise HTTPException(status_code=422, detail="Invalid timezone")
            sel_tz = sel_dt.astimezone(tz)
            until_dt = sel_tz - timedelta(seconds=1)
            orig_params["UNTIL"] = until_dt.astimezone(ZoneInfo("UTC")).strftime("%Y%m%dT%H%M%SZ")
        original_rule = _format_rrule_params(orig_params)

        # New series rule.
        new_params = dict(params)
        has_count = "COUNT" in params
        if has_count:
            original_count = int(params["COUNT"])
            new_count = original_count - count_before
            if new_count < 1:
                raise HTTPException(status_code=422, detail="Cannot split: selected occurrence outside COUNT")
            new_params["COUNT"] = str(new_count)
        # UNTIL preserved if present; infinite if neither.

        # Apply user replacement recurrence_rule if provided.
        user_rule = updates.get("recurrence_rule")
        if user_rule is not None:
            # validate
            try:
                recurrence.validate_event_recurrence(
                    is_all_day=event.is_all_day,
                    start_at=event.start_at,
                    end_at=event.end_at,
                    start_date=event.start_date,
                    end_date=event.end_date,
                    timezone=event.timezone,
                    recurrence_rule=user_rule,
                )
            except ValueError:
                raise HTTPException(status_code=422, detail="Invalid recurrence rule")
            new_rule = user_rule
        else:
            new_rule = _format_rrule_params(new_params)

        # Validate original_rule.
        try:
            recurrence.validate_event_recurrence(
                is_all_day=event.is_all_day,
                start_at=event.start_at,
                end_at=event.end_at,
                start_date=event.start_date,
                end_date=event.end_date,
                timezone=event.timezone,
                recurrence_rule=original_rule,
            )
        except ValueError:
            raise HTTPException(status_code=422, detail="Cannot split: original series rule invalid")

        # Prepare new event fields.
        new_title = updates.get("title", event.title)
        new_description = updates.get("description", event.description)
        new_location = updates.get("location", event.location)
        new_timezone = event.timezone

        if "project_id" in updates:
            new_project_id = updates["project_id"]
            if event.project_id is not None:
                project_service.require_project_manage(db, user_id, event.project_id)
            if new_project_id is not None:
                project_service.require_project_manage(db, user_id, new_project_id)
        else:
            new_project_id = event.project_id

        if event.is_all_day:
            sel_date = original if not isinstance(original, datetime) else original.date()
            duration_days = (event.end_date - event.start_date).days
            new_start_date = sel_date
            new_end_date = sel_date + timedelta(days=duration_days)
            new_event_data = {
                "title": new_title,
                "description": new_description,
                "location": new_location,
                "is_all_day": True,
                "start_date": new_start_date,
                "end_date": new_end_date,
                "timezone": None,
                "recurrence_rule": new_rule,
                "category": event.category,
                "project_id": new_project_id,
            }
        else:
            sel_dt = original.astimezone(ZoneInfo(event.timezone)) if isinstance(original, datetime) else original
            duration = event.end_at - event.start_at
            new_start = sel_dt
            new_end = sel_dt + duration
            new_event_data = {
                "title": new_title,
                "description": new_description,
                "location": new_location,
                "is_all_day": False,
                "start_at": new_start,
                "end_at": new_end,
                "timezone": new_timezone,
                "recurrence_rule": new_rule,
                "category": event.category,
                "project_id": new_project_id,
            }

        # Migrate exceptions.
        exceptions = repository.list_exceptions_for_event(db, event.id)
        to_migrate = []
        to_keep = []
        for exc in exceptions:
            ident = exc.original_start_at if exc.original_start_at is not None else exc.original_start_date
            if event.is_all_day:
                sel_cmp = original if not isinstance(original, datetime) else original.date()
                ident_cmp = ident if not isinstance(ident, datetime) else ident.date()
            else:
                sel_cmp = original
                ident_cmp = ident
            if ident_cmp >= sel_cmp:
                to_migrate.append(exc)
            else:
                to_keep.append(exc)

        # Validate keep exceptions still valid under original_rule.
        # Temporarily set? validate using event with original_rule.
        saved_rule = event.recurrence_rule
        event.recurrence_rule = original_rule
        for exc in to_keep:
            ident = exc.original_start_at if exc.original_start_at is not None else exc.original_start_date
            if not recurrence.is_valid_occurrence(event, ident):
                event.recurrence_rule = saved_rule
                raise HTTPException(status_code=409, detail="Existing exceptions cannot be preserved for this split")
        event.recurrence_rule = saved_rule

        # Transaction.
        try:
            new_event = repository.create_event(db, calendar_id, **new_event_data)
            db.flush()
            # A split creates a second event series. It must inherit the
            # original series' workspace associations so it can never become
            # an orphaned resource; fall back to the normal resolution path
            # for legacy events that have no association yet.
            from ..workspace import repository as ws_repo

            inherited_ws_ids = ws_repo.get_resource_workspace_ids(db, "event", event.id)
            if not inherited_ws_ids:
                inherited_ws_ids = [
                    _resolve_event_workspace_id(
                        db,
                        user_id,
                        workspace_id=None,
                        project_id=new_event.project_id,
                    )
                ]
            for ws_id in inherited_ws_ids:
                if not ws_repo.has_resource_workspace(db, "event", new_event.id, ws_id):
                    ws_repo.add_resource_workspace(db, "event", new_event.id, ws_id)
            # Reminders are per-event rows, so the new series inherits the
            # original's settings; otherwise every future occurrence of the
            # following part would silently stop reminding.
            for reminder in repository.list_reminders_for_event(db, event.id):
                repository.create_reminder(db, new_event.id, reminder.minutes_before)
            # Validate migrated exceptions against new event.
            for exc in to_migrate:
                ident = exc.original_start_at if exc.original_start_at is not None else exc.original_start_date
                if not recurrence.is_valid_occurrence(new_event, ident):
                    raise HTTPException(status_code=409, detail="Exception migration not possible for this split")
            # Migrate.
            for exc in to_migrate:
                exc.event_id = new_event.id
            # Update original event.
            event.recurrence_rule = original_rule
            db.commit()
        except HTTPException:
            db.rollback()
            raise
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="Could not split event")
        except Exception:
            db.rollback()
            raise HTTPException(status_code=400, detail="Could not split event")

        _reschedule_event_reminders(db, event, new_event)
        db.refresh(event)
        db.refresh(new_event)
        split_at = original
        return {
            "scope": "following",
            "event": None,
            "original_event": event,
            "new_event": new_event,
            "split_at": split_at,
        }

    raise HTTPException(status_code=422, detail="Invalid scope")


# --- Reminders ---


def list_reminders(db, calendar_id, event_id, user_id):
    _readable_event(db, calendar_id, event_id, user_id)
    return repository.list_reminders_for_event(db, event_id)


def create_reminder(db, calendar_id, event_id, user_id, data: ReminderCreate):
    event = _managed_event(db, calendar_id, event_id, user_id)
    reminder = repository.create_reminder(db, event_id, data.minutes_before)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Could not create reminder")
    db.refresh(reminder)
    _reschedule_event_reminders(db, event)
    return reminder


def update_reminder(db, calendar_id, event_id, reminder_id, user_id, data: ReminderUpdate):
    event = _managed_event(db, calendar_id, event_id, user_id)
    reminder = repository.get_reminder_for_event(db, event_id, reminder_id)
    if reminder is None:
        raise HTTPException(status_code=404, detail="Reminder not found")
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="Update body must not be empty")
    if "minutes_before" in updates:
        reminder.minutes_before = updates["minutes_before"]
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Could not update reminder")
    db.refresh(reminder)
    # The event-level invalidation inside the helper also clears this
    # reminder's pending rows, so no reminder-specific invalidation is needed.
    _reschedule_event_reminders(db, event)
    return reminder


def delete_reminder(db, calendar_id, event_id, reminder_id, user_id):
    event = _managed_event(db, calendar_id, event_id, user_id)
    reminder = repository.get_reminder_for_event(db, event_id, reminder_id)
    if reminder is None:
        raise HTTPException(status_code=404, detail="Reminder not found")
    try:
        scheduling.invalidate_future_pending_for_reminder(db, reminder.id)
        repository.delete_reminder(db, reminder)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not delete reminder")


# --- Event comments ---


def list_comments(
    db: Session, calendar_id: int, event_id: int, user_id: int, *, limit: int = 50, offset: int = 0
):
    _readable_event(db, calendar_id, event_id, user_id)
    return repository.list_comments_for_event(db, event_id, limit=limit, offset=offset)


def create_comment(
    db: Session, calendar_id: int, event_id: int, user_id: int, data: EventCommentCreate
):
    _managed_event(db, calendar_id, event_id, user_id)
    comment = repository.create_comment(db, event_id=event_id, user_id=user_id, content=data.content)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not create comment")
    db.refresh(comment)
    return comment


def update_comment(
    db: Session, calendar_id: int, event_id: int, comment_id: int, user_id: int, data: EventCommentUpdate
):
    _managed_event(db, calendar_id, event_id, user_id)
    comment = repository.get_comment_for_event(db, event_id, comment_id)
    if comment is None or comment.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Update body must not be empty")

    if "content" in updates:
        comment.content = updates["content"]

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not update comment")
    db.refresh(comment)
    return comment


def delete_comment(
    db: Session, calendar_id: int, event_id: int, comment_id: int, user_id: int
) -> None:
    _managed_event(db, calendar_id, event_id, user_id)
    comment = repository.get_comment_for_event(db, event_id, comment_id)
    if comment is None or comment.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    try:
        repository.delete_comment(db, comment)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Could not delete comment")


# ---------------------------------------------------------------------------
# Workspace associations (Phase 3)
# ---------------------------------------------------------------------------


def list_event_workspaces(db: Session, user_id: int, calendar_id: int, event_id: int) -> list[int]:
    event = _readable_event(db, calendar_id, event_id, user_id)
    from ..workspace import repository as ws_repo
    return ws_repo.get_resource_workspace_ids(db, "event", event.id)


def attach_event_to_workspace(db: Session, user_id: int, calendar_id: int, event_id: int, workspace_id: int) -> dict:
    event = _readable_event(db, calendar_id, event_id, user_id)
    from ..workspace import service as ws_service
    return ws_service.attach_resource_to_workspace(db, user_id, "event", event.id, workspace_id)


def detach_event_from_workspace(db: Session, user_id: int, calendar_id: int, event_id: int, workspace_id: int) -> dict:
    event = _readable_event(db, calendar_id, event_id, user_id)
    from ..workspace import service as ws_service
    return ws_service.detach_resource_from_workspace(db, user_id, "event", event.id, workspace_id)


def _event_workspaces_map(db: Session, actor_id: int, event_ids: list[int]) -> dict[int, list[dict]]:
    from ..workspace import repository as ws_repo
    return ws_repo.list_resource_workspaces_for_actor(db, "event", event_ids, actor_id)


def attach_event_workspaces(db: Session, actor_id: int, events: list[Event]) -> list[Event]:
    ws_map = _event_workspaces_map(db, actor_id, [e.id for e in events])
    for e in events:
        try:
            e.workspaces = ws_map.get(e.id, [])
        except Exception:
            pass
    return events


def attach_occurrence_workspaces(db: Session, actor_id: int, occurrences: list[OccurrenceResponse]) -> list[OccurrenceResponse]:
    ws_map = _event_workspaces_map(db, actor_id, [o.event_id for o in occurrences])
    for o in occurrences:
        o.workspaces = ws_map.get(o.event_id, [])
    return occurrences
