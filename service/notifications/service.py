from __future__ import annotations

from sqlalchemy.orm import Session

from . import repository
from .schemas import UnreadCountResponse


def list_notifications(db: Session, user_id: int, *, limit: int = 50, offset: int = 0, unread_only: bool | None = None):
    return repository.list_for_user(db, user_id, limit=limit, offset=offset, unread_only=unread_only)


def get_notification(db: Session, user_id: int, notification_id: int):
    notification = repository.get_for_user(db, user_id, notification_id)
    if notification is None:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return notification


def mark_read(db: Session, user_id: int, notification_id: int):
    notification = repository.get_for_user(db, user_id, notification_id)
    if notification is None:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    try:
        repository.mark_read(db, notification)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(notification)
    return notification


def mark_all_read(db: Session, user_id: int) -> int:
    try:
        count = repository.mark_all_read(db, user_id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return count


def unread_count(db: Session, user_id: int) -> UnreadCountResponse:
    return UnreadCountResponse(count=repository.count_unread(db, user_id))
