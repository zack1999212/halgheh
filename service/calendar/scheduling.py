from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from . import recurrence, repository
from .models import Event, ScheduledReminder

SCHEDULING_HORIZON_DAYS = int(os.getenv("REMINDER_SCHEDULING_HORIZON_DAYS", "30"))
SCHEDULER_INTERVAL_SECONDS = int(os.getenv("SCHEDULER_INTERVAL_SECONDS", "60"))
SCHEDULER_BATCH_SIZE = int(os.getenv("SCHEDULER_BATCH_SIZE", "100"))


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _effective_all_day_occurrence_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value


def schedule_event_reminders(db: Session, event: Event, *, now: datetime | None = None) -> int:
    """Create missing scheduled reminders for upcoming occurrences of *event*.

    Returns the number of scheduled reminder rows inserted.
    """
    reminders = repository.list_reminders_for_event(db, event.id)
    if not reminders:
        return 0

    if now is None:
        now = _utcnow()
    horizon = now + timedelta(days=SCHEDULING_HORIZON_DAYS)

    # Collect (original occurrence identity, effective occurrence start).
    occurrences: list[tuple[object, datetime | date]] = []

    if event.recurrence_rule is None:
        if event.is_all_day:
            occ_date = event.start_date
            if occ_date is not None and now.date() <= occ_date < horizon.date():
                occurrences.append((occ_date, occ_date))
        else:
            occ_start = event.start_at
            if occ_start is not None and now <= occ_start < horizon:
                occurrences.append((occ_start, occ_start))
    else:
        exceptions = repository.list_exceptions_for_events(db, [event.id])
        exc_map = {}
        for ex in exceptions:
            key = ex.original_start_at if ex.original_start_at is not None else ex.original_start_date
            exc_map[key] = ex

        handled_originals: set = set()

        if event.is_all_day:
            try:
                base_occs = recurrence.generate_allday_occurrences(
                    event, local_start_date=now.date(), local_end_date=horizon.date()
                )
            except ValueError:
                base_occs = []
            for occ_start_date, occ_end_date, orig_key in base_occs:
                exc = exc_map.get(orig_key)
                if exc is not None and exc.is_cancelled:
                    handled_originals.add(orig_key)
                    continue
                effective_date = occ_start_date
                if exc is not None and exc.start_date is not None:
                    effective_date = exc.start_date
                if now.date() <= effective_date < horizon.date():
                    occurrences.append((orig_key, effective_date))
                handled_originals.add(orig_key)

            # Moved exceptions whose effective occurrence lands in range.
            for exc in exceptions:
                if exc.is_cancelled:
                    continue
                orig_key = exc.original_start_at if exc.original_start_at is not None else exc.original_start_date
                if orig_key in handled_originals:
                    continue
                if exc.start_date is None and exc.end_date is None and exc.title is None and exc.description is None and exc.location is None:
                    continue
                effective_date = exc.start_date if exc.start_date is not None else _effective_all_day_occurrence_date(orig_key)
                if effective_date is None:
                    continue
                if now.date() <= effective_date < horizon.date():
                    occurrences.append((orig_key, effective_date))
        else:
            try:
                base_occs = recurrence.generate_timed_occurrences(
                    event, range_start=now, range_end=horizon
                )
            except ValueError:
                base_occs = []
            for occ_start, occ_end, orig_key in base_occs:
                exc = exc_map.get(orig_key)
                if exc is not None and exc.is_cancelled:
                    handled_originals.add(orig_key)
                    continue
                effective_start = occ_start
                if exc is not None and exc.start_at is not None:
                    effective_start = exc.start_at
                if now <= effective_start < horizon:
                    occurrences.append((orig_key, effective_start))
                handled_originals.add(orig_key)

            for exc in exceptions:
                if exc.is_cancelled:
                    continue
                orig_key = exc.original_start_at if exc.original_start_at is not None else exc.original_start_date
                if orig_key in handled_originals:
                    continue
                if exc.start_at is None and exc.end_at is None and exc.title is None and exc.description is None and exc.location is None:
                    continue
                effective_start = exc.start_at
                if effective_start is None:
                    if isinstance(orig_key, datetime):
                        effective_start = orig_key
                    else:
                        continue
                if now <= effective_start < horizon:
                    occurrences.append((orig_key, effective_start))

    inserted = 0

    for original, effective in occurrences:
        for reminder in reminders:
            if event.is_all_day:
                occ_date = original.date() if isinstance(original, datetime) else original
                effective_date = effective.date() if isinstance(effective, datetime) else effective
                effective_dt = datetime.combine(effective_date, datetime.min.time(), tzinfo=timezone.utc)
                scheduled_at = effective_dt - timedelta(minutes=reminder.minutes_before)
                values = {
                    "reminder_id": reminder.id,
                    "event_id": event.id,
                    "occurrence_start_at": None,
                    "occurrence_start_date": occ_date,
                    "scheduled_at": scheduled_at,
                    "status": "pending",
                }
                conflict_constraint = "uq_scheduled_reminders_allday"
            else:
                occ_start = original if isinstance(original, datetime) else None
                if occ_start is None:
                    continue
                effective_start = effective if isinstance(effective, datetime) else None
                if effective_start is None:
                    continue
                scheduled_at = effective_start - timedelta(minutes=reminder.minutes_before)
                values = {
                    "reminder_id": reminder.id,
                    "event_id": event.id,
                    "occurrence_start_at": occ_start,
                    "occurrence_start_date": None,
                    "scheduled_at": scheduled_at,
                    "status": "pending",
                }
                conflict_constraint = "uq_scheduled_reminders_timed"

            if conflict_constraint == "uq_scheduled_reminders_allday":
                stmt = pg_insert(ScheduledReminder).values(**values).on_conflict_do_nothing(
                    index_elements=["reminder_id", "occurrence_start_date"],
                    index_where=text("occurrence_start_date IS NOT NULL"),
                )
            else:
                stmt = pg_insert(ScheduledReminder).values(**values).on_conflict_do_nothing(
                    index_elements=["reminder_id", "occurrence_start_at"],
                    index_where=text("occurrence_start_at IS NOT NULL"),
                )
            result = db.execute(stmt)
            if result.rowcount:
                inserted += 1

    return inserted


def invalidate_future_pending_for_reminder(db: Session, reminder_id: int, *, now: datetime | None = None) -> int:
    if now is None:
        now = _utcnow()
    items = repository.list_pending_scheduled_reminders_for_reminder_future(db, reminder_id, now=now)
    repository.delete_pending_scheduled_reminders(db, items)
    return len(items)


def invalidate_future_pending_for_event(db: Session, event_id: int, *, now: datetime | None = None) -> int:
    if now is None:
        now = _utcnow()
    items = repository.list_pending_scheduled_reminders_for_event_future(db, event_id, now=now)
    repository.delete_pending_scheduled_reminders(db, items)
    return len(items)


def schedule_upcoming_reminders(db: Session, *, now: datetime | None = None) -> int:
    if now is None:
        now = _utcnow()
    events = repository.list_events_with_reminders(db)
    total = 0
    for event in events:
        try:
            total += schedule_event_reminders(db, event, now=now)
        except Exception:
            # Keep processing other events.
            continue
    return total


def process_due_scheduled_reminders(db: Session, *, now: datetime | None = None, limit: int = SCHEDULER_BATCH_SIZE) -> int:
    from .models import Event, Reminder
    from ..notifications import repository as notification_repository
    from ..notifications.models import Notification

    if now is None:
        now = _utcnow()

    processed_count = 0
    while processed_count < limit:
        claimed = repository.claim_due_scheduled_reminders(db, now=now, limit=1)
        if not claimed:
            break
        sr = claimed[0]
        # Eager load relations.
        db.refresh(sr)
        reminder = db.get(Reminder, sr.reminder_id)
        event = db.get(Event, sr.event_id)
        if reminder is None or event is None:
            sr.status = "processed"
            db.commit()
            processed_count += 1
            continue

        calendar = event.calendar
        user_id = calendar.user_id

        preference = notification_repository.get_preference(db, user_id)
        reminders_enabled = True if preference is None else preference.calendar_reminders_enabled
        if not reminders_enabled:
            sr.status = "skipped"
            try:
                db.commit()
            except Exception:
                db.rollback()
            processed_count += 1
            continue

        existing = notification_repository.get_by_scheduled_reminder(db, sr.id)
        if existing is None:
            notification = Notification(
                user_id=user_id,
                type="reminder",
                title=f"Reminder: {event.title}",
                message=f"{event.title} is coming up.",
                event_id=event.id,
                reminder_id=reminder.id,
                scheduled_reminder_id=sr.id,
                occurrence_start_at=sr.occurrence_start_at,
                occurrence_start_date=sr.occurrence_start_date,
            )
            db.add(notification)

        sr.status = "processed"
        try:
            db.commit()
        except Exception:
            db.rollback()
            # Mark processed in a best-effort transaction to avoid infinite loop.
            try:
                sr2 = db.get(type(sr), sr.id)
                if sr2 is not None:
                    sr2.status = "processed"
                    db.commit()
            except Exception:
                db.rollback()
            break
        processed_count += 1

    return processed_count
