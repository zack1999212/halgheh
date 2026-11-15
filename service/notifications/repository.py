from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from .models import Notification, NotificationPreference


def list_for_user(db: Session, user_id: int, *, limit: int, offset: int, unread_only: bool | None = None) -> list[Notification]:
    stmt = select(Notification).where(Notification.user_id == user_id)
    if unread_only is True:
        stmt = stmt.where(Notification.is_read.is_(False))
    elif unread_only is False:
        stmt = stmt.where(Notification.is_read.is_(True))
    stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt).all())


def get_for_user(db: Session, user_id: int, notification_id: int) -> Notification | None:
    stmt = select(Notification).where(Notification.id == notification_id, Notification.user_id == user_id)
    return db.scalars(stmt).first()


def get_by_scheduled_reminder(db: Session, scheduled_reminder_id: int) -> Notification | None:
    stmt = select(Notification).where(Notification.scheduled_reminder_id == scheduled_reminder_id)
    return db.scalars(stmt).first()


def count_unread(db: Session, user_id: int) -> int:
    stmt = select(func.count()).select_from(Notification).where(
        Notification.user_id == user_id, Notification.is_read.is_(False)
    )
    return int(db.scalar(stmt) or 0)


def mark_read(db: Session, notification: Notification) -> Notification:
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
    return notification


def mark_all_read(db: Session, user_id: int) -> int:
    now = datetime.now(timezone.utc)
    stmt = (
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        .values(is_read=True, read_at=now, updated_at=now)
    )
    result = db.execute(stmt)
    return int(result.rowcount or 0)


def get_preference(db: Session, user_id: int) -> NotificationPreference | None:
    stmt = select(NotificationPreference).where(NotificationPreference.user_id == user_id)
    return db.scalars(stmt).first()


def create_preference(db: Session, user_id: int, *, calendar_reminders_enabled: bool = True) -> NotificationPreference:
    preference = NotificationPreference(user_id=user_id, calendar_reminders_enabled=calendar_reminders_enabled)
    db.add(preference)
    return preference


def mark_unread(db: Session, notification: Notification) -> Notification:
    if notification.is_read:
        notification.is_read = False
        notification.read_at = None
    return notification


def delete_notification(db: Session, notification: Notification) -> None:
    db.delete(notification)


def delete_all_for_user(db: Session, user_id: int) -> int:
    stmt = delete(Notification).where(Notification.user_id == user_id)
    result = db.execute(stmt)
    return int(result.rowcount or 0)


def delete_expired_batch(db: Session, cutoff: datetime, batch_size: int) -> int:
    subq = select(Notification.id).where(Notification.created_at < cutoff).order_by(Notification.id).limit(batch_size)
    stmt = delete(Notification).where(Notification.id.in_(subq))
    result = db.execute(stmt)
    return int(result.rowcount or 0)
