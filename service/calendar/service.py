from __future__ import annotations

from datetime import date, datetime, time, timedelta
from dateutil.rrule import rrulestr
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import recurrence, repository, scheduling
from .models import Calendar, Event
from .schemas import (
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
)


def _calendar_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar not found")


def _event_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")


# Backward-compatible alias for existing internal use
def _not_found() -> HTTPException:
    return _calendar_not_found()


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


def _get_event_in_owned_calendar(
    db: Session, calendar_id: int, event_id: int, user_id: int
) -> Event:
    _get_owned_calendar(db, calendar_id, user_id)
    event = repository.get_event_for_calendar(db, calendar_id, event_id)
    if event is None:
        raise _event_not_found()
    return event


def create_event(db: Session, calendar_id: int, user_id: int, data: EventCreate) -> Event:
    _get_owned_calendar(db, calendar_id, user_id)
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
    event = repository.create_event(db, calendar_id, **data.model_dump())
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


def list_events(
    db: Session,
    calendar_id: int,
    user_id: int,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    timezone: str | None = None,
) -> list[Event]:
    _get_owned_calendar(db, calendar_id, user_id)

    if start is None and end is None and timezone is None:
        return repository.list_events_for_calendar(db, calendar_id)

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

    return repository.list_events_for_calendar_range(
        db,
        calendar_id,
        start=start_utc,
        end=end_utc,
        local_start_date=local_start_date,
        local_end_date=local_end_date,
    )


def get_event(db: Session, calendar_id: int, event_id: int, user_id: int) -> Event:
    return _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)


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
    }
    resulting.update(updates)

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


def update_event(
    db: Session, calendar_id: int, event_id: int, user_id: int, data: EventUpdate
) -> Event:
    event = _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
    _apply_event_update(event, data)

    scheduling.invalidate_future_pending_for_event(db, event.id)
    try:
        scheduling.schedule_event_reminders(db, event)
    except Exception:
        pass

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Could not update event"
        )
    db.refresh(event)
    return event


def delete_event(db: Session, calendar_id: int, event_id: int, user_id: int) -> None:
    event = _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
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


def list_occurrences(
    db: Session,
    calendar_id: int,
    user_id: int,
    start: datetime,
    end: datetime,
    timezone_name: str,
) -> list[OccurrenceResponse]:
    calendar = repository.get_for_user(db, calendar_id, user_id)
    if calendar is None:
        raise _calendar_not_found()

    try:
        tz = _validate_range_timezone(timezone_name)
    except HTTPException:
        raise

    if start.tzinfo is None or start.utcoffset() is None:
        raise HTTPException(status_code=422, detail="start must be timezone-aware")
    if end.tzinfo is None or end.utcoffset() is None:
        raise HTTPException(status_code=422, detail="end must be timezone-aware")
    if start >= end:
        raise HTTPException(status_code=422, detail="start must be earlier than end")
    if (end - start) > timedelta(days=366):
        raise HTTPException(status_code=422, detail="Requested range must not exceed one year")

    local_start_date, local_end_date = _compute_local_date_bounds(start, end, tz)

    # Query events.
    nonrec_timed = repository.list_nonrecurring_timed_overlapping(
        db, calendar_id, start=start, end=end
    )
    nonrec_allday = repository.list_nonrecurring_allday_overlapping(
        db, calendar_id, local_start_date=local_start_date, local_end_date=local_end_date
    )
    recurring_events = repository.list_recurring_events_for_calendar(db, calendar_id)
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
                    )
                )

    # Sort deterministically by effective start instant, then stable tie-breakers.
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
    _get_owned_calendar(db, calendar_id, user_id)
    event = _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
    if event.recurrence_rule is None:
        raise HTTPException(status_code=422, detail="Event is not recurring")
    excs = repository.list_exceptions_for_event(db, event_id)
    return excs


def get_exception(db, calendar_id, event_id, exception_id, user_id):
    _get_owned_calendar(db, calendar_id, user_id)
    _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
    exc = repository.get_exception_for_event(db, event_id, exception_id)
    if exc is None:
        raise HTTPException(status_code=404, detail="Exception not found")
    return exc


def create_exception(db, calendar_id, event_id, user_id, data: EventExceptionCreate):
    _get_owned_calendar(db, calendar_id, user_id)
    event = _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
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
    try:
        scheduling.invalidate_future_pending_for_event(db, event.id)
        scheduling.schedule_event_reminders(db, event)
        db.commit()
    except Exception:
        db.rollback()
    return exc


def update_exception(db, calendar_id, event_id, exception_id, user_id, data: EventExceptionUpdate):
    _get_owned_calendar(db, calendar_id, user_id)
    event = _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
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
    try:
        scheduling.invalidate_future_pending_for_event(db, event.id)
        scheduling.schedule_event_reminders(db, event)
        db.commit()
    except Exception:
        db.rollback()
    return exc


def delete_exception(db, calendar_id, event_id, exception_id, user_id):
    _get_owned_calendar(db, calendar_id, user_id)
    _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
    exc = repository.get_exception_for_event(db, event_id, exception_id)
    if exc is None:
        raise HTTPException(status_code=404, detail="Exception not found")
    try:
        repository.delete_exception(db, exc)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not delete exception")
    try:
        scheduling.invalidate_future_pending_for_event(db, event_id)
        event = _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
        scheduling.schedule_event_reminders(db, event)
        db.commit()
    except Exception:
        db.rollback()


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
    _get_owned_calendar(db, calendar_id, user_id)
    event = _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
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

        eu = EventUpdate(**updates)
        _apply_event_update(event, eu)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="Could not update event")
        try:
            scheduling.invalidate_future_pending_for_event(db, event.id)
            scheduling.schedule_event_reminders(db, event)
            db.commit()
        except Exception:
            db.rollback()
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
        allowed = {"title", "description", "location", "recurrence_rule"}
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

        try:
            scheduling.invalidate_future_pending_for_event(db, event.id)
            scheduling.schedule_event_reminders(db, event)
            scheduling.schedule_event_reminders(db, new_event)
            db.commit()
        except Exception:
            db.rollback()
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
    _get_owned_calendar(db, calendar_id, user_id)
    _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
    return repository.list_reminders_for_event(db, event_id)


def create_reminder(db, calendar_id, event_id, user_id, data: ReminderCreate):
    _get_owned_calendar(db, calendar_id, user_id)
    _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
    reminder = repository.create_reminder(db, event_id, data.minutes_before)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Could not create reminder")
    db.refresh(reminder)
    try:
        event = _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
        scheduling.invalidate_future_pending_for_event(db, event.id)
        scheduling.schedule_event_reminders(db, event)
        db.commit()
    except Exception:
        db.rollback()
    return reminder


def update_reminder(db, calendar_id, event_id, reminder_id, user_id, data: ReminderUpdate):
    _get_owned_calendar(db, calendar_id, user_id)
    _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
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
    try:
        scheduling.invalidate_future_pending_for_reminder(db, reminder.id)
        event = _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
        scheduling.invalidate_future_pending_for_event(db, event.id)
        scheduling.schedule_event_reminders(db, event)
        db.commit()
    except Exception:
        db.rollback()
    return reminder


def delete_reminder(db, calendar_id, event_id, reminder_id, user_id):
    _get_owned_calendar(db, calendar_id, user_id)
    _get_event_in_owned_calendar(db, calendar_id, event_id, user_id)
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
