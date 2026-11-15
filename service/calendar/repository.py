from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import and_, case, func, or_, select, text
from sqlalchemy.orm import Session

from .models import Calendar, Event, EventException, Reminder, ScheduledReminder


# --- Calendar operations ---


def create(db: Session, *, user_id: int, name: str, description: str | None, color: str | None) -> Calendar:
    calendar = Calendar(
        user_id=user_id,
        name=name,
        description=description,
        color=color,
        is_default=False,
    )
    db.add(calendar)
    return calendar


def list_for_user(db: Session, user_id: int) -> list[Calendar]:
    stmt = (
        select(Calendar)
        .where(Calendar.user_id == user_id)
        .order_by(
            case((Calendar.is_default.is_(True), 0), else_=1),
            Calendar.created_at.asc(),
            Calendar.id.asc(),
        )
    )
    return list(db.scalars(stmt).all())


def get_for_user(db: Session, calendar_id: int, user_id: int) -> Calendar | None:
    stmt = select(Calendar).where(Calendar.id == calendar_id, Calendar.user_id == user_id)
    return db.scalars(stmt).first()


def get_current_default(db: Session, user_id: int) -> Calendar | None:
    stmt = select(Calendar).where(Calendar.user_id == user_id, Calendar.is_default.is_(True))
    return db.scalars(stmt).first()


def delete(db: Session, calendar: Calendar) -> None:
    db.delete(calendar)


# --- Event operations ---


def create_event(db: Session, calendar_id: int, **data) -> Event:
    event = Event(calendar_id=calendar_id, **data)
    db.add(event)
    return event


def list_events_for_calendar(db: Session, calendar_id: int) -> list[Event]:
    # Consistent ordering across timed and all-day events with deterministic tie-breaking.
    start_key = func.coalesce(Event.start_at, text("timezone('UTC', events.start_date::timestamp)"))
    stmt = (
        select(Event)
        .where(Event.calendar_id == calendar_id)
        .order_by(start_key.asc(), Event.id.asc())
    )
    return list(db.scalars(stmt).all())


def get_event_for_calendar(db: Session, calendar_id: int, event_id: int) -> Event | None:
    stmt = select(Event).where(Event.calendar_id == calendar_id, Event.id == event_id)
    return db.scalars(stmt).first()


def delete_event(db: Session, event: Event) -> None:
    db.delete(event)


# --- Occurrence queries ---


def list_nonrecurring_timed_overlapping(
    db: Session, calendar_id: int, *, start: datetime, end: datetime
) -> list[Event]:
    stmt = (
        select(Event)
        .where(
            Event.calendar_id == calendar_id,
            Event.recurrence_rule.is_(None),
            Event.is_all_day.is_(False),
            Event.start_at < end,
            Event.end_at > start,
        )
        .order_by(Event.start_at.asc(), Event.id.asc())
    )
    return list(db.scalars(stmt).all())


def list_nonrecurring_allday_overlapping(
    db: Session, calendar_id: int, *, local_start_date, local_end_date
) -> list[Event]:
    stmt = (
        select(Event)
        .where(
            Event.calendar_id == calendar_id,
            Event.recurrence_rule.is_(None),
            Event.is_all_day.is_(True),
            Event.start_date < local_end_date,
            Event.end_date > local_start_date,
        )
        .order_by(Event.start_date.asc(), Event.id.asc())
    )
    return list(db.scalars(stmt).all())


def list_recurring_events_for_calendar(db: Session, calendar_id: int) -> list[Event]:
    stmt = (
        select(Event)
        .where(
            Event.calendar_id == calendar_id,
            Event.recurrence_rule.is_not(None),
        )
        .order_by(Event.id.asc())
    )
    return list(db.scalars(stmt).all())


def list_exceptions_for_events(
    db: Session, event_ids: list[int]
) -> list[EventException]:
    if not event_ids:
        return []
    stmt = select(EventException).where(EventException.event_id.in_(event_ids))
    return list(db.scalars(stmt).all())


# --- EventException operations ---


def list_exceptions_for_event(db: Session, event_id: int) -> list[EventException]:
    stmt = (
        select(EventException)
        .where(EventException.event_id == event_id)
        .order_by(
            EventException.original_start_at.asc().nulls_last(),
            EventException.original_start_date.asc().nulls_last(),
            EventException.id.asc(),
        )
    )
    return list(db.scalars(stmt).all())


def get_exception_for_event(
    db: Session, event_id: int, exception_id: int
) -> EventException | None:
    stmt = select(EventException).where(
        EventException.id == exception_id, EventException.event_id == event_id
    )
    return db.scalars(stmt).first()


def get_exception_by_original(
    db: Session,
    event_id: int,
    *,
    original_start_at=None,
    original_start_date=None,
) -> EventException | None:
    if original_start_at is not None:
        stmt = select(EventException).where(
            EventException.event_id == event_id,
            EventException.original_start_at == original_start_at,
        )
    else:
        stmt = select(EventException).where(
            EventException.event_id == event_id,
            EventException.original_start_date == original_start_date,
        )
    return db.scalars(stmt).first()


def create_exception(db: Session, **data) -> EventException:
    exc = EventException(**data)
    db.add(exc)
    return exc


def delete_exception(db: Session, exc: EventException) -> None:
    db.delete(exc)


def list_events_for_calendar_range(
    db: Session,
    calendar_id: int,
    *,
    start: datetime,
    end: datetime,
    local_start_date: date,
    local_end_date: date,
) -> list[Event]:
    # Consistent ordering across timed and all-day events with deterministic tie-breaking.
    start_key = func.coalesce(
        Event.start_at, text("timezone('UTC', events.start_date::timestamp)")
    )

    timed_overlap = and_(Event.start_at < end, Event.end_at > start)
    allday_overlap = and_(
        Event.start_date < local_end_date, Event.end_date > local_start_date
    )

    stmt = (
        select(Event)
        .where(
            Event.calendar_id == calendar_id,
            or_(timed_overlap, allday_overlap),
        )
        .order_by(start_key.asc(), Event.id.asc())
    )
    return list(db.scalars(stmt).all())


# --- Reminder operations ---


def list_reminders_for_event(db: Session, event_id: int) -> list[Reminder]:
    stmt = (
        select(Reminder)
        .where(Reminder.event_id == event_id)
        .order_by(Reminder.minutes_before.asc(), Reminder.id.asc())
    )
    return list(db.scalars(stmt).all())


def get_reminder_for_event(db: Session, event_id: int, reminder_id: int) -> Reminder | None:
    stmt = select(Reminder).where(Reminder.id == reminder_id, Reminder.event_id == event_id)
    return db.scalars(stmt).first()


def create_reminder(db: Session, event_id: int, minutes_before: int) -> Reminder:
    reminder = Reminder(event_id=event_id, minutes_before=minutes_before)
    db.add(reminder)
    return reminder


def delete_reminder(db: Session, reminder: Reminder) -> None:
    db.delete(reminder)


# --- Scheduled reminder operations ---


def list_events_with_reminders(db: Session) -> list[Event]:
    stmt = (
        select(Event)
        .where(Event.id.in_(select(Reminder.event_id)))
        .order_by(Event.id.asc())
    )
    return list(db.scalars(stmt).all())


def list_pending_scheduled_reminders_for_reminder_future(
    db: Session, reminder_id: int, *, now: datetime
) -> list[ScheduledReminder]:
    stmt = select(ScheduledReminder).where(
        ScheduledReminder.reminder_id == reminder_id,
        ScheduledReminder.status == "pending",
        (
            (ScheduledReminder.occurrence_start_at.is_not(None) & (ScheduledReminder.occurrence_start_at >= now))
            | (ScheduledReminder.occurrence_start_date.is_not(None) & (ScheduledReminder.occurrence_start_date >= now.date()))
        ),
    )
    return list(db.scalars(stmt).all())


def list_pending_scheduled_reminders_for_event_future(
    db: Session, event_id: int, *, now: datetime
) -> list[ScheduledReminder]:
    stmt = select(ScheduledReminder).where(
        ScheduledReminder.event_id == event_id,
        ScheduledReminder.status == "pending",
        (
            (ScheduledReminder.occurrence_start_at.is_not(None) & (ScheduledReminder.occurrence_start_at >= now))
            | (ScheduledReminder.occurrence_start_date.is_not(None) & (ScheduledReminder.occurrence_start_date >= now.date()))
        ),
    )
    return list(db.scalars(stmt).all())


def delete_pending_scheduled_reminders(db: Session, items: list[ScheduledReminder]) -> None:
    for item in items:
        db.delete(item)


def claim_due_scheduled_reminders(db: Session, *, now: datetime, limit: int) -> list[ScheduledReminder]:
    stmt = (
        select(ScheduledReminder)
        .where(ScheduledReminder.status == "pending", ScheduledReminder.scheduled_at <= now)
        .order_by(ScheduledReminder.scheduled_at.asc(), ScheduledReminder.id.asc())
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    return list(db.scalars(stmt).all())
