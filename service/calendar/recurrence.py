"""RFC 5545 recurrence expansion helpers for calendar events.

This module is intentionally free of database access, HTTP concerns, and
transaction management. It only parses and expands RRULE strings.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone as _tz
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dateutil.rrule import rrulestr

MAX_OCCURRENCES = 5000
_SAFETY_ITERATION_LIMIT = 100000


def _zone(tz_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        raise ValueError("timezone must be a valid IANA timezone identifier")


def validate_event_recurrence(
    *,
    is_all_day: bool,
    start_at: datetime | None,
    end_at: datetime | None,
    start_date,
    end_date,
    timezone: str | None,
    recurrence_rule: str | None,
) -> None:
    """Validate an RRULE against the event's actual DTSTART. Raises ValueError on failure."""
    if recurrence_rule is None:
        return
    if not isinstance(recurrence_rule, str) or not recurrence_rule.strip():
        raise ValueError("recurrence_rule must be a non-empty string")

    if is_all_day:
        if start_date is None or end_date is None:
            raise ValueError("All-day events must provide start_date and end_date")
        dtstart = start_date
    else:
        if start_at is None or end_at is None or timezone is None:
            raise ValueError("Timed events must provide start_at, end_at, and timezone")
        if start_at.tzinfo is None or start_at.utcoffset() is None:
            raise ValueError("start_at must be timezone-aware")
        if end_at.tzinfo is None or end_at.utcoffset() is None:
            raise ValueError("end_at must be timezone-aware")
        tz = _zone(timezone)
        dtstart = start_at.astimezone(tz)

    try:
        rr = rrulestr(recurrence_rule, dtstart=dtstart)
        # Force parsing/validation without expanding an unbounded series.
        next(iter(rr), None)
    except Exception:
        raise ValueError("Invalid recurrence rule")


def generate_timed_occurrences(event, *, range_start: datetime, range_end: datetime):
    """Return list of (occ_start, occ_end, original_start) datetimes in event tz."""
    event_tz = _zone(event.timezone)
    dtstart = event.start_at.astimezone(event_tz)
    duration = event.end_at - event.start_at

    rr = rrulestr(event.recurrence_rule, dtstart=dtstart)

    range_start_tz = range_start.astimezone(event_tz)
    range_end_tz = range_end.astimezone(event_tz)
    window_start = range_start_tz - duration

    result = []
    total = 0
    for occ in rr:
        total += 1
        if total > _SAFETY_ITERATION_LIMIT:
            raise ValueError("Recurrence expansion exceeded safety limit")
        if occ < window_start:
            continue
        if occ >= range_end_tz:
            break
        occ_end = occ + duration
        # Overlap check using instants.
        if occ.astimezone(_tz.utc) < range_end and occ_end.astimezone(_tz.utc) > range_start:
            result.append((occ, occ_end, occ))
        if len(result) > MAX_OCCURRENCES:
            raise ValueError("Too many occurrences")
    return result


def is_valid_occurrence(event, original_start) -> bool:
    """Return True if ``original_start`` identifies a real occurrence of ``event``."""
    if event.recurrence_rule is None:
        return False

    if event.is_all_day:
        if isinstance(original_start, datetime):
            target_date = original_start.date()
        else:
            target_date = original_start
        if not isinstance(target_date, date):
            return False
        if target_date < event.start_date:
            return False
        if target_date > event.start_date + timedelta(days=3650):
            return False
        try:
            rr = rrulestr(event.recurrence_rule, dtstart=event.start_date)
        except Exception:
            return False
        target_dt = datetime.combine(target_date, time.min)
        try:
            occ = rr.after(target_dt - timedelta(microseconds=1), inc=True)
        except Exception:
            return False
        return occ is not None and getattr(occ, "date", lambda: occ)() == target_date
    else:
        if not isinstance(original_start, datetime):
            return False
        try:
            tz = _zone(event.timezone)
        except ValueError:
            return False
        if original_start.tzinfo is None:
            return False
        target = original_start.astimezone(tz)
        dtstart = event.start_at.astimezone(tz)
        if target < dtstart:
            return False
        if target > dtstart + timedelta(days=3650):
            return False
        try:
            rr = rrulestr(event.recurrence_rule, dtstart=dtstart)
        except Exception:
            return False
        try:
            occ = rr.after(target - timedelta(microseconds=1), inc=True)
        except Exception:
            return False
        return occ is not None and occ == target


def generate_allday_occurrences(event, *, local_start_date, local_end_date):
    """Return list of (occ_start_date, occ_end_date, original_start_date)."""
    duration_days = (event.end_date - event.start_date).days
    dtstart = event.start_date

    rr = rrulestr(event.recurrence_rule, dtstart=dtstart)

    window_start_date = local_start_date - timedelta(days=duration_days)

    result = []
    total = 0
    for occ in rr:
        total += 1
        if total > _SAFETY_ITERATION_LIMIT:
            raise ValueError("Recurrence expansion exceeded safety limit")
        occ_date = occ.date() if isinstance(occ, datetime) else occ
        if occ_date < window_start_date:
            continue
        if occ_date >= local_end_date:
            break
        occ_end_date = occ_date + timedelta(days=duration_days)
        if occ_date < local_end_date and occ_end_date > local_start_date:
            result.append((occ_date, occ_end_date, occ_date))
        if len(result) > MAX_OCCURRENCES:
            raise ValueError("Too many occurrences")
    return result
