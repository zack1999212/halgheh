"""Calendar tools for the Calendar Agent.

Every handler delegates to ``service.calendar.service`` so the agent obeys the
same authorization, validation, recurrence and reminder rules as ordinary
Calendar API requests. This module only adapts natural-language tool arguments
to those services; it does not reimplement calendar business logic.
"""

from __future__ import annotations

import os
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from pydantic import ValidationError

from ..calendar import repository as calendar_repository
from ..calendar import service as calendar_service
from ..calendar.schemas import (
    ALLOWED_EVENT_CATEGORIES,
    EventCreate,
    EventExceptionCreate,
    EventExceptionUpdate,
    EventUpdate,
    OccurrenceEditRequest,
    ReminderCreate,
    ReminderUpdate,
)
from .tools import ToolContext, ToolError, ToolSpec, register_tool

MAX_RANGE_DAYS = 366
MAX_SLOT_RANGE_DAYS = 31
_WEEKDAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")
_FREQUENCIES = ("DAILY", "WEEKLY", "MONTHLY", "YEARLY")
_NON_FIELD_KEYS = {
    "event_id",
    "calendar_id",
    "calendar_name",
    "occurrence_start",
}


def _flag(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


# Destructive actions always require confirmation. Creation and ordinary updates
# follow a configurable policy; the framework supports requiring them too.
_CONFIRM_CREATE = _flag("AGENT_CONFIRM_CREATE_EVENT", False)
_CONFIRM_UPDATE = _flag("AGENT_CONFIRM_UPDATE_EVENT", False)


# --- Argument helpers ---


def _validation_message(exc: ValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return "The calendar request was invalid."
    return str(errors[0].get("msg") or "Invalid value").replace(
        "Value error, ", ""
    ).strip()


def _call(fn, *args, **kwargs):
    """Run an existing calendar service function with safe error translation."""
    try:
        return fn(*args, **kwargs)
    except HTTPException as exc:
        detail = exc.detail
        if isinstance(detail, str) and detail.strip():
            raise ToolError(detail)
        raise ToolError("The calendar operation could not be completed.")
    except ValidationError as exc:
        raise ToolError(_validation_message(exc))


def _zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        raise ToolError("timezone must be a valid IANA timezone identifier")


def _resolve_tz(context: ToolContext, args: dict[str, Any]) -> tuple[str, ZoneInfo]:
    name = (args.get("timezone") or context.timezone or "").strip()
    if not name:
        raise ToolError(
            "A timezone is required to interpret these dates. Set the "
            "conversation timezone or pass an IANA timezone."
        )
    return name, _zone(name)


def _parse_datetime(value: Any, tz: ZoneInfo, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ToolError(f"{field} must be an ISO 8601 date or date-time")
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise ToolError(f"{field} must be an ISO 8601 date or date-time")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        parsed = parsed.replace(tzinfo=tz)
    return parsed


def _parse_date(value: Any, field: str) -> date:
    if not isinstance(value, str) or "T" in value:
        raise ToolError(f"{field} must be a YYYY-MM-DD date")
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        raise ToolError(f"{field} must be a YYYY-MM-DD date")


def _int_arg(
    args: dict[str, Any],
    name: str,
    default: int,
    *,
    minimum: int,
    maximum: int,
) -> int:
    value = args.get(name, default)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ToolError(f"{name} must be an integer")
    if value < minimum or value > maximum:
        raise ToolError(f"{name} must be between {minimum} and {maximum}")
    return value


def _parse_range(
    context: ToolContext, args: dict[str, Any], *, max_days: int = MAX_RANGE_DAYS
) -> tuple[datetime, datetime, str, ZoneInfo]:
    tz_name, tz = _resolve_tz(context, args)
    start = _parse_datetime(args.get("start"), tz, "start")
    end = _parse_datetime(args.get("end"), tz, "end")
    if end <= start:
        raise ToolError("end must be later than start")
    if end - start > timedelta(days=max_days):
        raise ToolError(f"The requested range must not exceed {max_days} days")
    return start, end, tz_name, tz


def _event_id(args: dict[str, Any]) -> int:
    value = args.get("event_id")
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ToolError("event_id must be a positive integer")
    return value


# --- Calendar resolution ---


def _owned_calendars(context: ToolContext):
    calendars = _call(calendar_service.list_calendars, context.db, context.user.id)
    if not calendars:
        raise ToolError("No calendar is available for this account.")
    return calendars


def _resolve_calendar(context: ToolContext, args: dict[str, Any]):
    calendar_id = args.get("calendar_id")
    calendar_name = args.get("calendar_name")
    if calendar_id is not None and calendar_name is not None:
        raise ToolError("Provide either calendar_id or calendar_name, not both")
    calendars = _owned_calendars(context)

    if calendar_id is not None:
        if isinstance(calendar_id, bool) or not isinstance(calendar_id, int):
            raise ToolError("calendar_id must be an integer")
        return _call(
            calendar_service.get_calendar, context.db, calendar_id, context.user.id
        )

    if calendar_name:
        wanted = calendar_name.strip().casefold()
        matches = [c for c in calendars if c.name.casefold() == wanted]
        if len(matches) == 1:
            return matches[0]
        if not matches:
            names = ", ".join(sorted(c.name for c in calendars))
            raise ToolError(
                f"No calendar named '{calendar_name}'. Available calendars: {names}"
            )
        raise ToolError(
            f"More than one calendar is named '{calendar_name}'. Use calendar_id."
        )

    if len(calendars) == 1:
        return calendars[0]
    defaults = [c for c in calendars if c.is_default]
    if len(defaults) == 1:
        return defaults[0]
    names = ", ".join(sorted(c.name for c in calendars))
    raise ToolError(f"Several calendars are available ({names}). Ask which one to use.")


def _target_calendars(context: ToolContext, args: dict[str, Any]):
    if args.get("calendar_id") is not None or args.get("calendar_name"):
        return [_resolve_calendar(context, args)]
    return _owned_calendars(context)


def _load_event(context: ToolContext, args: dict[str, Any]):
    calendar = _resolve_calendar(context, args)
    event = _call(
        calendar_service.get_event,
        context.db,
        calendar.id,
        _event_id(args),
        context.user.id,
    )
    return calendar, event


# --- Serialization ---


def _event_start(event) -> str:
    return (
        event.start_date.isoformat()
        if event.is_all_day
        else event.start_at.isoformat()
    )


def _event_end(event) -> str:
    return (
        event.end_date.isoformat() if event.is_all_day else event.end_at.isoformat()
    )


def _event_dict(event) -> dict[str, Any]:
    return {
        "event_id": event.id,
        "calendar_id": event.calendar_id,
        "title": event.title,
        "description": event.description,
        "location": event.location,
        "is_all_day": event.is_all_day,
        "start": _event_start(event),
        "end": _event_end(event),
        "timezone": event.timezone,
        "recurrence_rule": event.recurrence_rule,
        "is_recurring": event.recurrence_rule is not None,
        "category": event.category,
    }


def _occurrence_dict(occ) -> dict[str, Any]:
    data = {
        "event_id": occ.event_id,
        "title": occ.title,
        "is_all_day": occ.is_all_day,
        "start": (
            occ.start_date.isoformat() if occ.is_all_day else occ.start_at.isoformat()
        ),
        "end": occ.end_date.isoformat() if occ.is_all_day else occ.end_at.isoformat(),
        "timezone": occ.timezone,
        "is_recurring": occ.is_recurring,
        "is_exception": occ.is_exception,
        "category": occ.category,
    }
    if occ.is_recurring:
        identity = occ.original_start_date or occ.original_start_at
        if identity is not None:
            # Pass this back as occurrence_start for occurrence/series tools.
            data["occurrence_start"] = identity.isoformat()
    return data


def _occurrence_sort_key(occ, tz: ZoneInfo) -> datetime:
    if occ.is_all_day:
        return datetime.combine(occ.start_date, time.min, tzinfo=tz)
    return occ.start_at.astimezone(tz)


def _event_when(event) -> str:
    if event.is_all_day:
        return f"{event.start_date.isoformat()} to {event.end_date.isoformat()} (all-day, end date exclusive)"
    return f"{event.start_at.isoformat()} to {event.end_at.isoformat()}"


def _event_when_local(event, fallback_tz: str | None = None) -> str:
    """Human-facing time range rendered in the event's own timezone."""
    if event.is_all_day:
        return _event_when(event)
    try:
        event_tz = ZoneInfo(event.timezone or fallback_tz or "UTC")
        return (
            f"{event.start_at.astimezone(event_tz).isoformat()} to "
            f"{event.end_at.astimezone(event_tz).isoformat()}"
        )
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return _event_when(event)


def _reminder_dict(reminder) -> dict[str, Any]:
    return {
        "reminder_id": reminder.id,
        "event_id": reminder.event_id,
        "minutes_before": reminder.minutes_before,
    }


# --- Recurrence ---


def _build_rrule(
    raw: Any,
    *,
    is_all_day: bool,
    start: datetime | date,
    tz_name: str | None,
) -> str:
    if not isinstance(raw, dict):
        raise ToolError("recurrence must be an object")
    allowed = {"frequency", "interval", "by_day", "until_date", "count"}
    unexpected = set(raw) - allowed
    if unexpected:
        raise ToolError(
            "Unsupported recurrence option(s): " + ", ".join(sorted(unexpected))
        )

    frequency = str(raw.get("frequency") or "").upper()
    if frequency not in _FREQUENCIES:
        raise ToolError(
            "recurrence.frequency must be one of: " + ", ".join(_FREQUENCIES)
        )

    interval = raw.get("interval", 1)
    if isinstance(interval, bool) or not isinstance(interval, int):
        raise ToolError("recurrence.interval must be an integer")
    if interval < 1 or interval > 52:
        raise ToolError("recurrence.interval must be between 1 and 52")

    parts = [f"FREQ={frequency}"]
    if interval != 1:
        parts.append(f"INTERVAL={interval}")

    by_day = raw.get("by_day")
    if by_day is not None:
        if frequency != "WEEKLY":
            raise ToolError("recurrence.by_day is only supported for weekly rules")
        if not isinstance(by_day, list) or not by_day or len(by_day) > 7:
            raise ToolError("recurrence.by_day must be a non-empty list of weekdays")
        days: list[str] = []
        for value in by_day:
            day = str(value).upper()
            if day not in _WEEKDAYS:
                raise ToolError(
                    "recurrence.by_day values must be one of: "
                    + ", ".join(_WEEKDAYS)
                )
            if day not in days:
                days.append(day)
        parts.append("BYDAY=" + ",".join(days))
        start_weekday = _WEEKDAYS[start.weekday()]
        if start_weekday not in days:
            raise ToolError(
                "The start date's weekday is not in recurrence.by_day. Choose a "
                "start date that matches the selected weekdays so the series is unambiguous."
            )

    count = raw.get("count")
    until = raw.get("until_date")
    if count is not None and until is not None:
        raise ToolError("Provide either recurrence.count or recurrence.until_date, not both")

    if count is not None:
        if isinstance(count, bool) or not isinstance(count, int):
            raise ToolError("recurrence.count must be an integer")
        if count < 1 or count > 1000:
            raise ToolError("recurrence.count must be between 1 and 1000")
        parts.append(f"COUNT={count}")
    elif until is not None:
        until_date = _parse_date(until, "recurrence.until_date")
        if is_all_day:
            if until_date < start:
                raise ToolError("recurrence.until_date must not be before the start date")
            parts.append("UNTIL=" + until_date.strftime("%Y%m%d"))
        else:
            if not tz_name:
                raise ToolError("A timezone is required for a timed recurring event")
            tz = _zone(tz_name)
            assert isinstance(start, datetime)
            if until_date < start.astimezone(tz).date():
                raise ToolError("recurrence.until_date must not be before the start date")
            local_end = datetime.combine(
                until_date + timedelta(days=1), time.min, tzinfo=tz
            ) - timedelta(seconds=1)
            parts.append(
                "UNTIL="
                + local_end.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            )

    return ";".join(parts)


def _parse_occurrence_identity(event, value: Any) -> datetime | date:
    if event.is_all_day:
        return _parse_date(value, "occurrence_start")
    tz = _zone(event.timezone or "UTC")
    parsed = _parse_datetime(value, tz, "occurrence_start")
    return parsed.astimezone(tz)


# --- Descriptions for confirmation previews ---


def _describe_event(
    context: ToolContext,
    args: dict[str, Any],
    operation: str,
    scope: str | None = None,
) -> str:
    try:
        _, event = _load_event(context, args)
    except ToolError as exc:
        return f"{operation}: event {args.get('event_id')} ({exc.message})"
    lines = [f"Operation: {operation}", f"Event: {event.title}"]
    lines.append(f"When: {_event_when_local(event, context.timezone)}")
    if event.timezone:
        lines.append(f"Timezone: {event.timezone}")
    if event.recurrence_rule:
        lines.append("Recurring series: yes")
    if scope:
        lines.append(f"Scope: {scope}")
    if args.get("occurrence_start"):
        lines.append(f"Occurrence: {args['occurrence_start']}")
    changed = [key for key in args if key not in _NON_FIELD_KEYS]
    if changed:
        lines.append(
            "Changes: "
            + ", ".join(
                "recurrence rule" if key == "recurrence" else key.replace("_", " ")
                for key in sorted(changed)
            )
        )
    return " | ".join(lines)


def _describe_change(operation: str, scope: str | None = None):
    def describe(context: ToolContext, args: dict[str, Any]) -> str:
        return _describe_event(context, args, operation, scope)

    return describe


def _describe_create(context: ToolContext, args: dict[str, Any]) -> str:
    when = str(args.get("start", ""))
    if args.get("end"):
        when += f" to {args['end']}"
    lines = [
        "Operation: Create event",
        f"Event: {args.get('title', '')}",
        f"When: {when}" + (" (all-day)" if args.get("all_day") else ""),
    ]
    tz_name = args.get("timezone") or context.timezone
    if tz_name and not args.get("all_day"):
        lines.append(f"Timezone: {tz_name}")
    recurrence = args.get("recurrence")
    if isinstance(recurrence, dict):
        bits = [str(recurrence.get("frequency", "")).lower()]
        if recurrence.get("interval"):
            bits.append(f"every {recurrence['interval']}")
        if recurrence.get("by_day"):
            bits.append("on " + ", ".join(map(str, recurrence["by_day"])))
        if recurrence.get("count"):
            bits.append(f"{recurrence['count']} times")
        if recurrence.get("until_date"):
            bits.append(f"until {recurrence['until_date']}")
        lines.append("Recurrence: " + " ".join(bits))
    return " | ".join(lines)


# --- Discovery tools ---


def _list_events(context: ToolContext, **args: Any) -> dict[str, Any]:
    start, end, tz_name, tz = _parse_range(context, args)
    calendars = _target_calendars(context, args)
    occurrences: list[Any] = []
    for calendar in calendars:
        occurrences.extend(
            _call(
                calendar_service.list_occurrences,
                context.db,
                calendar.id,
                context.user.id,
                start,
                end,
                tz_name,
            )
        )
    occurrences.sort(key=lambda occ: _occurrence_sort_key(occ, tz))
    limit = _int_arg(args, "limit", 100, minimum=1, maximum=200)
    total = len(occurrences)
    selected = occurrences[:limit]
    return {
        "operation": "list_events",
        "status": "succeeded",
        "summary": (
            f"Found {total} event occurrence(s) from {start.isoformat()} "
            f"to {end.isoformat()}."
        ),
        "timezone": tz_name,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "count": len(selected),
        "total": total,
        "truncated": total > len(selected),
        "events": [_occurrence_dict(occ) for occ in selected],
    }


def _get_event(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar, event = _load_event(context, args)
    reminders = _call(
        calendar_service.list_reminders,
        context.db,
        calendar.id,
        event.id,
        context.user.id,
    )
    return {
        "operation": "get_event",
        "status": "succeeded",
        "summary": f"Event '{event.title}' on {_event_when(event)}.",
        "event": _event_dict(event),
        "reminders": [_reminder_dict(reminder) for reminder in reminders],
    }


def _search_events(context: ToolContext, **args: Any) -> dict[str, Any]:
    query = str(args.get("query") or "").strip()
    if not query:
        raise ToolError("query must not be empty")

    has_start = "start" in args
    has_end = "end" in args
    if has_start != has_end:
        raise ToolError("Provide both start and end, or neither")
    start = end = None
    tz_name = args.get("timezone") or context.timezone or "UTC"
    tz = _zone(tz_name)
    if has_start:
        start, end, tz_name, tz = _parse_range(context, args)

    calendars = _target_calendars(context, args)
    wanted = query.casefold()
    matches: list[Any] = []
    for calendar in calendars:
        if start is not None and end is not None:
            events = _call(
                calendar_service.list_events,
                context.db,
                calendar.id,
                context.user.id,
                start=start,
                end=end,
                timezone=tz_name,
            )
        else:
            events = _call(
                calendar_service.list_events,
                context.db,
                calendar.id,
                context.user.id,
            )
        for event in events:
            haystack = " ".join(
                part for part in (event.title, event.description, event.location) if part
            ).casefold()
            if wanted in haystack:
                matches.append(event)

    matches.sort(
        key=lambda event: (
            datetime.combine(event.start_date, time.min, tzinfo=tz)
            if event.is_all_day
            else event.start_at.astimezone(tz)
        )
    )
    limit = _int_arg(args, "limit", 50, minimum=1, maximum=100)
    total = len(matches)
    selected = matches[:limit]
    return {
        "operation": "search_events",
        "status": "succeeded",
        "summary": f"Found {total} event(s) matching '{query}'.",
        "query": query,
        "count": len(selected),
        "total": total,
        "truncated": total > len(selected),
        "events": [_event_dict(event) for event in selected],
        "note": (
            "Recurring events are returned once as a series. Use list_events to "
            "see individual occurrences."
        ),
    }


def _get_calendar_overview(context: ToolContext, **args: Any) -> dict[str, Any]:
    start, end, tz_name, tz = _parse_range(context, args)
    calendars = _target_calendars(context, args)
    occurrences: list[Any] = []
    for calendar in calendars:
        occurrences.extend(
            _call(
                calendar_service.list_occurrences,
                context.db,
                calendar.id,
                context.user.id,
                start,
                end,
                tz_name,
            )
        )

    by_day: dict[str, int] = {}
    by_category: dict[str, int] = {}
    timed = all_day = recurring = exceptions = 0
    for occ in occurrences:
        local_date = (
            occ.start_date
            if occ.is_all_day
            else occ.start_at.astimezone(tz).date()
        )
        key = local_date.isoformat()
        by_day[key] = by_day.get(key, 0) + 1
        category = occ.category or "other"
        by_category[category] = by_category.get(category, 0) + 1
        if occ.is_all_day:
            all_day += 1
        else:
            timed += 1
        if occ.is_recurring:
            recurring += 1
        if occ.is_exception:
            exceptions += 1

    busiest = max(by_day.items(), key=lambda item: (item[1], item[0])) if by_day else None
    return {
        "operation": "get_calendar_overview",
        "status": "succeeded",
        "summary": (
            f"{len(occurrences)} occurrence(s) from "
            f"{start.astimezone(tz).date().isoformat()} to "
            f"{(end - timedelta(microseconds=1)).astimezone(tz).date().isoformat()}."
        ),
        "timezone": tz_name,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "calendars": [calendar.name for calendar in calendars],
        "total": len(occurrences),
        "timed": timed,
        "all_day": all_day,
        "recurring_occurrences": recurring,
        "exception_occurrences": exceptions,
        "by_category": by_category,
        "by_day": by_day,
        "busiest_day": (
            {"date": busiest[0], "count": busiest[1]} if busiest else None
        ),
    }


# --- Creation tools ---


def _create_event(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar = _resolve_calendar(context, args)
    all_day = bool(args.get("all_day", False))
    title = str(args.get("title") or "").strip()
    if not title:
        raise ToolError("title must not be empty")

    if all_day:
        start_date = _parse_date(args.get("start"), "start")
        end_date = (
            _parse_date(args["end"], "end")
            if "end" in args
            else start_date + timedelta(days=1)
        )
        try:
            data = EventCreate(
                title=title,
                description=args.get("description"),
                location=args.get("location"),
                category=args.get("category", "other"),
                is_all_day=True,
                start_date=start_date,
                end_date=end_date,
            )
        except ValidationError as exc:
            raise ToolError(_validation_message(exc))
    else:
        tz_name, tz = _resolve_tz(context, args)
        start = _parse_datetime(args.get("start"), tz, "start")
        end = (
            _parse_datetime(args["end"], tz, "end")
            if "end" in args
            else start + timedelta(minutes=60)
        )
        try:
            data = EventCreate(
                title=title,
                description=args.get("description"),
                location=args.get("location"),
                category=args.get("category", "other"),
                is_all_day=False,
                start_at=start,
                end_at=end,
                timezone=tz_name,
            )
        except ValidationError as exc:
            raise ToolError(_validation_message(exc))

    event = _call(
        calendar_service.create_event,
        context.db,
        calendar.id,
        context.user.id,
        data,
    )
    return {
        "operation": "create_event",
        "status": "succeeded",
        "event_id": event.id,
        "event": _event_dict(event),
        "summary": f"Created '{event.title}' on {_event_when(event)}.",
    }


def _create_recurring_event(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar = _resolve_calendar(context, args)
    all_day = bool(args.get("all_day", False))
    title = str(args.get("title") or "").strip()
    if not title:
        raise ToolError("title must not be empty")
    if not isinstance(args.get("recurrence"), dict):
        raise ToolError("recurrence is required")

    if all_day:
        start_date = _parse_date(args.get("start"), "start")
        end_date = (
            _parse_date(args["end"], "end")
            if "end" in args
            else start_date + timedelta(days=1)
        )
        rule = _build_rrule(
            args["recurrence"], is_all_day=True, start=start_date, tz_name=None
        )
        try:
            data = EventCreate(
                title=title,
                description=args.get("description"),
                location=args.get("location"),
                category=args.get("category", "other"),
                is_all_day=True,
                start_date=start_date,
                end_date=end_date,
                recurrence_rule=rule,
            )
        except ValidationError as exc:
            raise ToolError(_validation_message(exc))
    else:
        tz_name, tz = _resolve_tz(context, args)
        start = _parse_datetime(args.get("start"), tz, "start")
        end = (
            _parse_datetime(args["end"], tz, "end")
            if "end" in args
            else start + timedelta(minutes=60)
        )
        rule = _build_rrule(
            args["recurrence"], is_all_day=False, start=start, tz_name=tz_name
        )
        try:
            data = EventCreate(
                title=title,
                description=args.get("description"),
                location=args.get("location"),
                category=args.get("category", "other"),
                is_all_day=False,
                start_at=start,
                end_at=end,
                timezone=tz_name,
                recurrence_rule=rule,
            )
        except ValidationError as exc:
            raise ToolError(_validation_message(exc))

    event = _call(
        calendar_service.create_event,
        context.db,
        calendar.id,
        context.user.id,
        data,
    )
    return {
        "operation": "create_recurring_event",
        "status": "succeeded",
        "event_id": event.id,
        "event": _event_dict(event),
        "summary": (
            f"Created recurring event '{event.title}' on {_event_when(event)} "
            f"with rule {rule}."
        ),
    }


# --- Modification tools ---


def _update_event(context: ToolContext, **args: Any) -> dict[str, Any]:
    fields = {
        key: args[key]
        for key in ("title", "description", "location", "category")
        if key in args
    }
    if not fields:
        raise ToolError("Provide at least one of title, description, location or category")

    calendar, event = _load_event(context, args)
    if event.recurrence_rule is not None:
        raise ToolError(
            "This is a recurring event. Use edit_occurrence for one occurrence, "
            "edit_series for the whole series, or split_series for following occurrences."
        )
    try:
        data = EventUpdate(**fields)
    except ValidationError as exc:
        raise ToolError(_validation_message(exc))
    event = _call(
        calendar_service.update_event,
        context.db,
        calendar.id,
        event.id,
        context.user.id,
        data,
    )
    return {
        "operation": "update_event",
        "status": "succeeded",
        "event_id": event.id,
        "event": _event_dict(event),
        "summary": f"Updated '{event.title}' ({', '.join(sorted(fields))}).",
    }


def _move_event(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar, event = _load_event(context, args)
    if event.recurrence_rule is not None:
        raise ToolError(
            "This is a recurring event. Use edit_occurrence or edit_series to "
            "change its schedule."
        )

    if event.is_all_day:
        if args.get("timezone"):
            raise ToolError("All-day events do not use a timezone")
        new_start = _parse_date(args.get("start"), "start")
        duration = event.end_date - event.start_date
        data = EventUpdate(
            start_date=new_start, end_date=new_start + duration
        )
    else:
        tz_name = args.get("timezone") or event.timezone
        if not tz_name:
            raise ToolError("This event has no timezone; provide one")
        tz = _zone(tz_name)
        new_start = _parse_datetime(args.get("start"), tz, "start")
        new_end = new_start + (event.end_at - event.start_at)
        data = EventUpdate(start_at=new_start, end_at=new_end, timezone=tz_name)

    event = _call(
        calendar_service.update_event,
        context.db,
        calendar.id,
        event.id,
        context.user.id,
        data,
    )
    return {
        "operation": "move_event",
        "status": "succeeded",
        "event_id": event.id,
        "event": _event_dict(event),
        "summary": f"Moved '{event.title}' to {_event_when(event)}.",
    }


def _resize_event(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar, event = _load_event(context, args)
    if event.recurrence_rule is not None:
        raise ToolError(
            "This is a recurring event. Use edit_occurrence or edit_series to "
            "change its duration."
        )

    if event.is_all_day:
        if args.get("timezone"):
            raise ToolError("All-day events do not use a timezone")
        new_end = _parse_date(args.get("end"), "end")
        if new_end <= event.start_date:
            raise ToolError("end must be later than the event start date")
        data = EventUpdate(end_date=new_end)
    else:
        tz_name = args.get("timezone") or event.timezone
        if not tz_name:
            raise ToolError("This event has no timezone; provide one")
        tz = _zone(tz_name)
        new_end = _parse_datetime(args.get("end"), tz, "end")
        if new_end <= event.start_at:
            raise ToolError("end must be later than the event start time")
        data = EventUpdate(end_at=new_end)

    event = _call(
        calendar_service.update_event,
        context.db,
        calendar.id,
        event.id,
        context.user.id,
        data,
    )
    return {
        "operation": "resize_event",
        "status": "succeeded",
        "event_id": event.id,
        "event": _event_dict(event),
        "summary": f"Resized '{event.title}' to {_event_when(event)}.",
    }


def _edit_occurrence(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar, event = _load_event(context, args)
    if event.recurrence_rule is None:
        raise ToolError(
            "This event is not recurring. Use update_event, move_event or resize_event."
        )
    original = _parse_occurrence_identity(event, args.get("occurrence_start"))

    updates: dict[str, Any] = {}
    for key in ("title", "description"):
        if key in args:
            updates[key] = args[key]

    if event.is_all_day:
        if "start" in args or "end" in args:
            duration = event.end_date - event.start_date
            start_date = (
                _parse_date(args["start"], "start") if "start" in args else None
            )
            end_date = _parse_date(args["end"], "end") if "end" in args else None
            if start_date is None and end_date is not None:
                start_date = end_date - duration
            if end_date is None and start_date is not None:
                end_date = start_date + duration
            updates["start_date"] = start_date
            updates["end_date"] = end_date
        if not updates:
            raise ToolError("Provide at least one change for this occurrence")
        request = OccurrenceEditRequest(
            scope="occurrence", original_start_date=original, **updates
        )
    else:
        tz = _zone(event.timezone or "UTC")
        if "start" in args or "end" in args:
            duration = event.end_at - event.start_at
            new_start = (
                _parse_datetime(args["start"], tz, "start") if "start" in args else None
            )
            new_end = (
                _parse_datetime(args["end"], tz, "end") if "end" in args else None
            )
            if new_start is None and new_end is not None:
                new_start = new_end - duration
            if new_end is None and new_start is not None:
                new_end = new_start + duration
            updates["start_at"] = new_start
            updates["end_at"] = new_end
        if not updates:
            raise ToolError("Provide at least one change for this occurrence")
        request = OccurrenceEditRequest(
            scope="occurrence", original_start_at=original, **updates
        )

    result = _call(
        calendar_service.edit_occurrence,
        context.db,
        calendar.id,
        event.id,
        context.user.id,
        request,
    )
    changed_event = result.get("event") or event
    return {
        "operation": "edit_occurrence",
        "status": "succeeded",
        "event_id": event.id,
        "scope": "occurrence",
        "occurrence_start": str(args.get("occurrence_start")),
        "event": _event_dict(changed_event),
        "summary": (
            f"Updated one occurrence of '{event.title}' starting "
            f"{args.get('occurrence_start')}; the rest of the series is unchanged."
        ),
    }


def _edit_series(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar, event = _load_event(context, args)
    if event.recurrence_rule is None:
        raise ToolError("This event is not recurring. Use update_event.")

    updates: dict[str, Any] = {}
    for key in ("title", "description", "location", "category"):
        if key in args:
            updates[key] = args[key]

    if event.is_all_day:
        if args.get("timezone"):
            raise ToolError("All-day events do not use a timezone")
        duration = event.end_date - event.start_date
        if "start" in args:
            start_date = _parse_date(args["start"], "start")
            end_date = (
                _parse_date(args["end"], "end")
                if "end" in args
                else start_date + duration
            )
            updates["start_date"] = start_date
            updates["end_date"] = end_date
        elif "end" in args:
            updates["end_date"] = _parse_date(args["end"], "end")
        rule_start: datetime | date = updates.get("start_date", event.start_date)
        rule_tz = None
    else:
        tz_name = args.get("timezone") or event.timezone
        if not tz_name:
            raise ToolError("This event has no timezone; provide one")
        tz = _zone(tz_name)
        duration = event.end_at - event.start_at
        if "start" in args:
            new_start = _parse_datetime(args["start"], tz, "start")
            new_end = (
                _parse_datetime(args["end"], tz, "end")
                if "end" in args
                else new_start + duration
            )
            updates["start_at"] = new_start
            updates["end_at"] = new_end
        elif "end" in args:
            updates["end_at"] = _parse_datetime(args["end"], tz, "end")
        if "timezone" in args:
            updates["timezone"] = tz_name
        rule_start = updates.get("start_at", event.start_at)
        rule_tz = updates.get("timezone", event.timezone)

    if "recurrence" in args:
        updates["recurrence_rule"] = _build_rrule(
            args["recurrence"],
            is_all_day=event.is_all_day,
            start=rule_start,
            tz_name=rule_tz,
        )

    if not updates:
        raise ToolError("Provide at least one change for the series")

    if event.is_all_day:
        request = OccurrenceEditRequest(
            scope="series", original_start_date=event.start_date, **updates
        )
    else:
        request = OccurrenceEditRequest(
            scope="series", original_start_at=event.start_at, **updates
        )

    result = _call(
        calendar_service.edit_occurrence,
        context.db,
        calendar.id,
        event.id,
        context.user.id,
        request,
    )
    changed = result.get("event") or event
    return {
        "operation": "edit_series",
        "status": "succeeded",
        "event_id": changed.id,
        "scope": "series",
        "event": _event_dict(changed),
        "summary": f"Updated the entire recurring series '{changed.title}'.",
    }


def _split_series(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar, event = _load_event(context, args)
    if event.recurrence_rule is None:
        raise ToolError("This event is not recurring.")
    original = _parse_occurrence_identity(event, args.get("occurrence_start"))

    updates: dict[str, Any] = {}
    for key in ("title", "description", "location"):
        if key in args:
            updates[key] = args[key]
    if "recurrence" in args:
        updates["recurrence_rule"] = _build_rrule(
            args["recurrence"],
            is_all_day=event.is_all_day,
            start=original,
            tz_name=event.timezone,
        )
    if not updates:
        raise ToolError("Provide at least one change for the following occurrences")

    if event.is_all_day:
        request = OccurrenceEditRequest(
            scope="following", original_start_date=original, **updates
        )
    else:
        request = OccurrenceEditRequest(
            scope="following", original_start_at=original, **updates
        )

    result = _call(
        calendar_service.edit_occurrence,
        context.db,
        calendar.id,
        event.id,
        context.user.id,
        request,
    )
    new_event = result.get("new_event")
    return {
        "operation": "split_series",
        "status": "succeeded",
        "event_id": event.id,
        "scope": "following",
        "occurrence_start": str(args.get("occurrence_start")),
        "new_event_id": new_event.id if new_event is not None else None,
        "event": _event_dict(event),
        "new_event": _event_dict(new_event) if new_event is not None else None,
        "summary": (
            f"Split '{event.title}' at {args.get('occurrence_start')}: earlier "
            "occurrences keep the original series and following occurrences use "
            "the new settings."
        ),
    }


# --- Deletion tools ---


def _delete_event(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar, event = _load_event(context, args)
    if event.recurrence_rule is not None:
        raise ToolError(
            "This is a recurring series. Use delete_series to remove the whole "
            "series or delete_occurrence to cancel one occurrence."
        )
    title = event.title
    _call(
        calendar_service.delete_event,
        context.db,
        calendar.id,
        event.id,
        context.user.id,
    )
    return {
        "operation": "delete_event",
        "status": "deleted",
        "event_id": event.id,
        "summary": f"Deleted event '{title}'.",
    }


def _delete_occurrence(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar, event = _load_event(context, args)
    if event.recurrence_rule is None:
        raise ToolError("This event is not recurring. Use delete_event.")
    original = _parse_occurrence_identity(event, args.get("occurrence_start"))

    existing = calendar_repository.get_exception_by_original(
        context.db,
        event.id,
        original_start_at=original if not event.is_all_day else None,
        original_start_date=original if event.is_all_day else None,
    )
    if existing is not None:
        _call(
            calendar_service.update_exception,
            context.db,
            calendar.id,
            event.id,
            existing.id,
            context.user.id,
            EventExceptionUpdate(is_cancelled=True),
        )
    else:
        _call(
            calendar_service.create_exception,
            context.db,
            calendar.id,
            event.id,
            context.user.id,
            EventExceptionCreate(
                original_start_at=original if not event.is_all_day else None,
                original_start_date=original if event.is_all_day else None,
                is_cancelled=True,
            ),
        )
    return {
        "operation": "delete_occurrence",
        "status": "cancelled",
        "event_id": event.id,
        "scope": "occurrence",
        "occurrence_start": str(args.get("occurrence_start")),
        "summary": (
            f"Cancelled one occurrence of '{event.title}' at "
            f"{args.get('occurrence_start')}; the series remains."
        ),
    }


def _delete_series(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar, event = _load_event(context, args)
    if event.recurrence_rule is None:
        raise ToolError("This event is not recurring. Use delete_event.")
    title = event.title
    _call(
        calendar_service.delete_event,
        context.db,
        calendar.id,
        event.id,
        context.user.id,
    )
    return {
        "operation": "delete_series",
        "status": "deleted",
        "event_id": event.id,
        "scope": "series",
        "summary": f"Deleted the entire recurring series '{title}'.",
    }


# --- Reminder tools ---


def _list_reminders(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar, event = _load_event(context, args)
    reminders = _call(
        calendar_service.list_reminders,
        context.db,
        calendar.id,
        event.id,
        context.user.id,
    )
    return {
        "operation": "list_reminders",
        "status": "succeeded",
        "event_id": event.id,
        "reminders": [_reminder_dict(reminder) for reminder in reminders],
        "summary": f"{len(reminders)} reminder(s) for '{event.title}'.",
    }


def _create_reminder(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar, event = _load_event(context, args)
    minutes = _int_arg(
        args, "minutes_before", 0, minimum=0, maximum=525600
    )
    reminder = _call(
        calendar_service.create_reminder,
        context.db,
        calendar.id,
        event.id,
        context.user.id,
        ReminderCreate(minutes_before=minutes),
    )
    return {
        "operation": "create_reminder",
        "status": "succeeded",
        "event_id": event.id,
        "reminder": _reminder_dict(reminder),
        "summary": (
            f"Reminder {minutes} minute(s) before '{event.title}'."
        ),
    }


def _update_reminder(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar, event = _load_event(context, args)
    reminder_id = _int_arg(args, "reminder_id", 0, minimum=1, maximum=2**31 - 1)
    minutes = _int_arg(
        args, "minutes_before", 0, minimum=0, maximum=525600
    )
    reminder = _call(
        calendar_service.update_reminder,
        context.db,
        calendar.id,
        event.id,
        reminder_id,
        context.user.id,
        ReminderUpdate(minutes_before=minutes),
    )
    return {
        "operation": "update_reminder",
        "status": "succeeded",
        "event_id": event.id,
        "reminder": _reminder_dict(reminder),
        "summary": f"Reminder updated to {minutes} minute(s) before '{event.title}'.",
    }


def _delete_reminder(context: ToolContext, **args: Any) -> dict[str, Any]:
    calendar, event = _load_event(context, args)
    reminder_id = _int_arg(args, "reminder_id", 0, minimum=1, maximum=2**31 - 1)
    _call(
        calendar_service.delete_reminder,
        context.db,
        calendar.id,
        event.id,
        reminder_id,
        context.user.id,
    )
    return {
        "operation": "delete_reminder",
        "status": "deleted",
        "event_id": event.id,
        "reminder_id": reminder_id,
        "summary": f"Deleted a reminder for '{event.title}'.",
    }


# --- Availability ---


def _find_free_slots(context: ToolContext, **args: Any) -> dict[str, Any]:
    start, end, tz_name, tz = _parse_range(
        context, args, max_days=MAX_SLOT_RANGE_DAYS
    )
    duration_minutes = _int_arg(
        args, "duration_minutes", 30, minimum=5, maximum=1440
    )
    day_start = _int_arg(args, "day_start_hour", 9, minimum=0, maximum=23)
    day_end = _int_arg(args, "day_end_hour", 17, minimum=1, maximum=24)
    if day_end <= day_start:
        raise ToolError("day_end_hour must be later than day_start_hour")
    max_slots = _int_arg(args, "max_slots", 10, minimum=1, maximum=50)
    include_weekends = bool(args.get("include_weekends", True))

    calendars = _target_calendars(context, args)
    occurrences: list[Any] = []
    for calendar in calendars:
        occurrences.extend(
            _call(
                calendar_service.list_occurrences,
                context.db,
                calendar.id,
                context.user.id,
                start,
                end,
                tz_name,
            )
        )

    blocked_days: set[date] = set()
    timed_busy: list[tuple[datetime, datetime]] = []
    for occ in occurrences:
        if occ.is_all_day:
            cursor = occ.start_date
            while cursor < occ.end_date:
                blocked_days.add(cursor)
                cursor += timedelta(days=1)
        else:
            timed_busy.append(
                (
                    occ.start_at.astimezone(tz),
                    occ.end_at.astimezone(tz),
                )
            )

    range_start = start.astimezone(tz)
    range_end = end.astimezone(tz)
    current = range_start.date()
    last = (range_end - timedelta(microseconds=1)).date()
    duration = timedelta(minutes=duration_minutes)
    slots: list[dict[str, str]] = []

    while current <= last and len(slots) < max_slots:
        if not include_weekends and current.weekday() >= 5:
            current += timedelta(days=1)
            continue
        if current in blocked_days:
            current += timedelta(days=1)
            continue

        window_start = datetime.combine(current, time(hour=day_start), tzinfo=tz)
        if day_end == 24:
            window_end = datetime.combine(
                current + timedelta(days=1), time.min, tzinfo=tz
            )
        else:
            window_end = datetime.combine(current, time(hour=day_end), tzinfo=tz)
        window_start = max(window_start, range_start)
        window_end = min(window_end, range_end)
        if window_end <= window_start:
            current += timedelta(days=1)
            continue

        busy = sorted(
            (
                (max(busy_start, window_start), min(busy_end, window_end))
                for busy_start, busy_end in timed_busy
                if busy_start < window_end and busy_end > window_start
            ),
            key=lambda item: item[0],
        )

        gaps: list[tuple[datetime, datetime]] = []
        cursor = window_start
        for busy_start, busy_end in busy:
            if busy_start > cursor:
                gaps.append((cursor, busy_start))
            if busy_end > cursor:
                cursor = busy_end
        if cursor < window_end:
            gaps.append((cursor, window_end))

        for gap_start, gap_end in gaps:
            slot_start = gap_start
            while slot_start + duration <= gap_end and len(slots) < max_slots:
                slots.append(
                    {
                        "start": slot_start.isoformat(),
                        "end": (slot_start + duration).isoformat(),
                    }
                )
                slot_start += duration

        current += timedelta(days=1)

    return {
        "operation": "find_free_slots",
        "status": "succeeded",
        "timezone": tz_name,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "duration_minutes": duration_minutes,
        "calendars": [calendar.name for calendar in calendars],
        "count": len(slots),
        "slots": slots,
        "data_complete": True,
        "summary": (
            f"Found {len(slots)} free {duration_minutes}-minute slot(s) between "
            f"{start.isoformat()} and {end.isoformat()}."
        ),
        "note": (
            "Free slots are computed deterministically from all of the user's "
            "Halgheh calendars in this date range. All-day events block the whole "
            "local day. External calendars, travel time and preferences are not "
            "considered, so treat a slot as a suggestion rather than a guarantee."
        ),
    }


# --- Input schemas ---


def _calendar_props() -> dict[str, Any]:
    return {
        "calendar_id": {
            "type": "integer",
            "description": "Calendar id. Optional when the user has one calendar or a default.",
        },
        "calendar_name": {
            "type": "string",
            "maxLength": 100,
            "description": "Calendar name to use instead of calendar_id.",
        },
    }


def _schema(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    merged = _calendar_props()
    merged.update(properties)
    return {
        "type": "object",
        "properties": merged,
        "required": required,
        "additionalProperties": False,
    }


_EVENT_ID = {
    "type": "integer",
    "description": "Existing event id from list_events, search_events or get_event.",
}


def _register_one(
    name: str,
    description: str,
    schema: dict[str, Any],
    handler,
    *,
    requires_confirmation: bool = False,
    describe=None,
    permissions: frozenset[str] = frozenset({"calendar.read"}),
) -> None:
    register_tool(
        ToolSpec(
            name=name,
            description=description,
            input_schema=schema,
            agent_id="calendar",
            handler=handler,
            required_permissions=permissions,
            requires_confirmation=requires_confirmation,
            describe=describe,
        )
    )


# Event discovery
_register_one(
    "list_events",
    "List event occurrences in a date range, expanding recurring events and cancellations. "
    "Start and end are ISO 8601 strings; end is exclusive. Use the returned occurrence_start "
    "value to address one occurrence of a recurring event.",
    _schema(
        {
            "start": {"type": "string", "description": "Range start (ISO 8601), inclusive."},
            "end": {"type": "string", "description": "Range end (ISO 8601), exclusive."},
            "timezone": {"type": "string", "maxLength": 64, "description": "IANA timezone for the range."},
            "limit": {"type": "integer", "description": "Maximum occurrences to return (1-200, default 100)."},
        },
        ["start", "end"],
    ),
    _list_events,
)

_register_one(
    "get_event",
    "Get one event's full details and reminders by event id.",
    _schema({"event_id": _EVENT_ID}, ["event_id"]),
    _get_event,
)

_register_one(
    "search_events",
    "Search events by text in title, description or location, optionally limited to a date range.",
    _schema(
        {
            "query": {"type": "string", "maxLength": 255, "description": "Text to find, case-insensitive."},
            "start": {"type": "string", "description": "Optional range start (ISO 8601)."},
            "end": {"type": "string", "description": "Optional range end (ISO 8601), exclusive."},
            "timezone": {"type": "string", "maxLength": 64, "description": "IANA timezone for the range."},
            "limit": {"type": "integer", "description": "Maximum results (1-100, default 50)."},
        },
        ["query"],
    ),
    _search_events,
)

_register_one(
    "get_calendar_overview",
    "Summarize a date range: totals, timed/all-day counts, categories and per-day counts.",
    _schema(
        {
            "start": {"type": "string", "description": "Range start (ISO 8601), inclusive."},
            "end": {"type": "string", "description": "Range end (ISO 8601), exclusive."},
            "timezone": {"type": "string", "maxLength": 64, "description": "IANA timezone for the range."},
        },
        ["start", "end"],
    ),
    _get_calendar_overview,
)

# Event creation
_register_one(
    "create_event",
    "Create a timed or all-day event. For all-day events pass YYYY-MM-DD dates and all_day=true; "
    "end is exclusive and defaults to one day. Timed events default to 60 minutes when end is omitted.",
    _schema(
        {
            "title": {"type": "string", "maxLength": 255, "description": "Event title."},
            "description": {"type": "string", "description": "Optional notes."},
            "location": {"type": "string", "maxLength": 255, "description": "Optional location."},
            "category": {
                "type": "string",
                "enum": list(ALLOWED_EVENT_CATEGORIES),
                "description": "Optional category; defaults to other.",
            },
            "all_day": {"type": "boolean", "description": "True for an all-day event."},
            "start": {"type": "string", "description": "ISO 8601 start date or date-time."},
            "end": {"type": "string", "description": "Optional ISO 8601 end; exclusive for all-day."},
            "timezone": {"type": "string", "maxLength": 64, "description": "IANA timezone for timed events."},
        },
        ["title", "start"],
    ),
    _create_event,
    requires_confirmation=_CONFIRM_CREATE,
    describe=_describe_create,
    permissions=frozenset({"calendar.write"}),
)

_register_one(
    "create_recurring_event",
    "Create a recurring event using the existing recurrence engine. recurrence requires frequency "
    "(DAILY, WEEKLY, MONTHLY, YEARLY) and supports interval, by_day (weekly only) and exactly one of "
    "count or until_date. For weekly rules the start weekday must be included in by_day.",
    _schema(
        {
            "title": {"type": "string", "maxLength": 255},
            "description": {"type": "string"},
            "location": {"type": "string", "maxLength": 255},
            "category": {"type": "string", "enum": list(ALLOWED_EVENT_CATEGORIES)},
            "all_day": {"type": "boolean"},
            "start": {"type": "string", "description": "ISO 8601 start date or date-time."},
            "end": {"type": "string", "description": "Optional ISO 8601 end."},
            "timezone": {"type": "string", "maxLength": 64},
            "recurrence": {
                "type": "object",
                "description": "Recurrence rule parameters.",
                "properties": {
                    "frequency": {"type": "string", "enum": list(_FREQUENCIES)},
                    "interval": {"type": "integer"},
                    "by_day": {"type": "array", "items": {"type": "string", "enum": list(_WEEKDAYS)}},
                    "until_date": {"type": "string"},
                    "count": {"type": "integer"},
                },
                "required": ["frequency"],
                "additionalProperties": False,
            },
        },
        ["title", "start", "recurrence"],
    ),
    _create_recurring_event,
    requires_confirmation=_CONFIRM_CREATE,
    describe=_describe_create,
    permissions=frozenset({"calendar.write"}),
)

# Event modification
_register_one(
    "update_event",
    "Update a non-recurring event's title, description, location or category. For recurring events "
    "use edit_occurrence, edit_series or split_series.",
    _schema(
        {
            "event_id": _EVENT_ID,
            "title": {"type": "string", "maxLength": 255},
            "description": {"type": "string"},
            "location": {"type": "string", "maxLength": 255},
            "category": {"type": "string", "enum": list(ALLOWED_EVENT_CATEGORIES)},
        },
        ["event_id"],
    ),
    _update_event,
    requires_confirmation=_CONFIRM_UPDATE,
    describe=_describe_change("Update event", "single event"),
    permissions=frozenset({"calendar.write"}),
)

_register_one(
    "move_event",
    "Move a non-recurring event to a new start date/time, preserving its duration and timezone.",
    _schema(
        {
            "event_id": _EVENT_ID,
            "start": {"type": "string", "description": "New ISO 8601 start."},
            "timezone": {"type": "string", "maxLength": 64, "description": "Optional timezone override."},
        },
        ["event_id", "start"],
    ),
    _move_event,
    requires_confirmation=_CONFIRM_UPDATE,
    describe=_describe_change("Move event", "single event"),
    permissions=frozenset({"calendar.write"}),
)

_register_one(
    "resize_event",
    "Change a non-recurring event's end time/date without moving its start.",
    _schema(
        {
            "event_id": _EVENT_ID,
            "end": {"type": "string", "description": "New ISO 8601 end."},
            "timezone": {"type": "string", "maxLength": 64},
        },
        ["event_id", "end"],
    ),
    _resize_event,
    requires_confirmation=_CONFIRM_UPDATE,
    describe=_describe_change("Resize event", "single event"),
    permissions=frozenset({"calendar.write"}),
)

_register_one(
    "edit_occurrence",
    "Edit exactly one occurrence of a recurring event. occurrence_start must be the occurrence_start "
    "returned by list_events. The rest of the series is unchanged.",
    _schema(
        {
            "event_id": _EVENT_ID,
            "occurrence_start": {"type": "string", "description": "Original occurrence start (ISO 8601)."},
            "title": {"type": "string", "maxLength": 255},
            "description": {"type": "string"},
            "start": {"type": "string", "description": "Optional new ISO 8601 start."},
            "end": {"type": "string", "description": "Optional new ISO 8601 end."},
        },
        ["event_id", "occurrence_start"],
    ),
    _edit_occurrence,
    requires_confirmation=_CONFIRM_UPDATE,
    describe=_describe_change("Edit one occurrence", "single occurrence"),
    permissions=frozenset({"calendar.write"}),
)

_register_one(
    "edit_series",
    "Change an entire recurring series. Requires explicit user confirmation. Changing timing or the "
    "recurrence rule may be refused when exceptions exist.",
    _schema(
        {
            "event_id": _EVENT_ID,
            "title": {"type": "string", "maxLength": 255},
            "description": {"type": "string"},
            "location": {"type": "string", "maxLength": 255},
            "category": {"type": "string", "enum": list(ALLOWED_EVENT_CATEGORIES)},
            "start": {"type": "string", "description": "Optional new ISO 8601 start."},
            "end": {"type": "string", "description": "Optional new ISO 8601 end."},
            "timezone": {"type": "string", "maxLength": 64},
            "recurrence": {
                "type": "object",
                "properties": {
                    "frequency": {"type": "string", "enum": list(_FREQUENCIES)},
                    "interval": {"type": "integer"},
                    "by_day": {"type": "array", "items": {"type": "string", "enum": list(_WEEKDAYS)}},
                    "until_date": {"type": "string"},
                    "count": {"type": "integer"},
                },
                "required": ["frequency"],
                "additionalProperties": False,
            },
        },
        ["event_id"],
    ),
    _edit_series,
    requires_confirmation=True,
    describe=_describe_change("Edit entire recurring series", "entire series"),
    permissions=frozenset({"calendar.write"}),
)

_register_one(
    "split_series",
    "Split a recurring series at an occurrence: earlier occurrences keep the original series and "
    "this and following occurrences get the new settings. Only title, description, location and "
    "recurrence_rule can change for the following part. Requires explicit user confirmation.",
    _schema(
        {
            "event_id": _EVENT_ID,
            "occurrence_start": {"type": "string", "description": "Split point occurrence start."},
            "title": {"type": "string", "maxLength": 255},
            "description": {"type": "string"},
            "location": {"type": "string", "maxLength": 255},
            "recurrence": {
                "type": "object",
                "properties": {
                    "frequency": {"type": "string", "enum": list(_FREQUENCIES)},
                    "interval": {"type": "integer"},
                    "by_day": {"type": "array", "items": {"type": "string", "enum": list(_WEEKDAYS)}},
                    "until_date": {"type": "string"},
                    "count": {"type": "integer"},
                },
                "required": ["frequency"],
                "additionalProperties": False,
            },
        },
        ["event_id", "occurrence_start"],
    ),
    _split_series,
    requires_confirmation=True,
    describe=_describe_change("Split recurring series", "this and following occurrences"),
    permissions=frozenset({"calendar.write"}),
)

# Event deletion
_register_one(
    "delete_event",
    "Delete a non-recurring event. Requires explicit user confirmation.",
    _schema({"event_id": _EVENT_ID}, ["event_id"]),
    _delete_event,
    requires_confirmation=True,
    describe=_describe_change("Delete event", "single event"),
    permissions=frozenset({"calendar.write"}),
)

_register_one(
    "delete_occurrence",
    "Cancel exactly one occurrence of a recurring event. Requires explicit user confirmation.",
    _schema(
        {
            "event_id": _EVENT_ID,
            "occurrence_start": {"type": "string", "description": "Occurrence to cancel."},
        },
        ["event_id", "occurrence_start"],
    ),
    _delete_occurrence,
    requires_confirmation=True,
    describe=_describe_change("Cancel recurring occurrence", "single occurrence"),
    permissions=frozenset({"calendar.write"}),
)

_register_one(
    "delete_series",
    "Delete an entire recurring series. Requires explicit user confirmation.",
    _schema({"event_id": _EVENT_ID}, ["event_id"]),
    _delete_series,
    requires_confirmation=True,
    describe=_describe_change("Delete recurring series", "entire series"),
    permissions=frozenset({"calendar.write"}),
)

# Reminders
_register_one(
    "list_reminders",
    "List the reminders configured for an event.",
    _schema({"event_id": _EVENT_ID}, ["event_id"]),
    _list_reminders,
)

_register_one(
    "create_reminder",
    "Create a reminder a number of minutes before an event.",
    _schema(
        {
            "event_id": _EVENT_ID,
            "minutes_before": {"type": "integer", "description": "Minutes before the event (0-525600)."},
        },
        ["event_id", "minutes_before"],
    ),
    _create_reminder,
    permissions=frozenset({"calendar.write"}),
)

_register_one(
    "update_reminder",
    "Change how many minutes before an event an existing reminder fires.",
    _schema(
        {
            "event_id": _EVENT_ID,
            "reminder_id": {"type": "integer", "description": "Reminder id from list_reminders."},
            "minutes_before": {"type": "integer"},
        },
        ["event_id", "reminder_id", "minutes_before"],
    ),
    _update_reminder,
    permissions=frozenset({"calendar.write"}),
)

_register_one(
    "delete_reminder",
    "Delete an existing reminder from an event.",
    _schema(
        {
            "event_id": _EVENT_ID,
            "reminder_id": {"type": "integer"},
        },
        ["event_id", "reminder_id"],
    ),
    _delete_reminder,
    permissions=frozenset({"calendar.write"}),
)

# Availability
_register_one(
    "find_free_slots",
    "Find free intervals in a date range, avoiding timed and all-day events across the user's "
    "calendars. Read-only: it never creates events. Times are returned in the requested timezone.",
    _schema(
        {
            "start": {"type": "string", "description": "Range start (ISO 8601), inclusive."},
            "end": {"type": "string", "description": "Range end (ISO 8601), exclusive."},
            "duration_minutes": {"type": "integer", "description": "Required slot duration in minutes (5-1440)."},
            "timezone": {"type": "string", "maxLength": 64},
            "day_start_hour": {"type": "integer", "description": "Earliest hour to consider (0-23, default 9)."},
            "day_end_hour": {"type": "integer", "description": "Latest hour boundary (1-24, default 17)."},
            "max_slots": {"type": "integer", "description": "Maximum slots to return (1-50, default 10)."},
            "include_weekends": {"type": "boolean", "description": "Include Saturday/Sunday (default true)."},
        },
        ["start", "end", "duration_minutes"],
    ),
    _find_free_slots,
)
