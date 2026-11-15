from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Notification


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
    stmt = select(Notification).where(Notification.user_id == user_id, Notification.is_read.is_(False))
    items = list(db.scalars(stmt).all())
    now = datetime.now(timezone.utc)
    for n in items:
        n.is_read = True
        n.read_at = now
    return len(items)
