from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import repository
from .models import NotificationPreference
from .schemas import (
    NotificationBulkResponse,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
    UnreadCountResponse,
)


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")


def list_notifications(db: Session, user_id: int, *, limit: int = 50, offset: int = 0, unread_only: bool | None = None):
    return repository.list_for_user(db, user_id, limit=limit, offset=offset, unread_only=unread_only)


def get_notification(db: Session, user_id: int, notification_id: int):
    notification = repository.get_for_user(db, user_id, notification_id)
    if notification is None:
        raise _not_found()
    return notification


def mark_read(db: Session, user_id: int, notification_id: int):
    notification = repository.get_for_user(db, user_id, notification_id)
    if notification is None:
        raise _not_found()
    try:
        repository.mark_read(db, notification)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(notification)
    return notification


def mark_unread(db: Session, user_id: int, notification_id: int):
    notification = repository.get_for_user(db, user_id, notification_id)
    if notification is None:
        raise _not_found()
    try:
        repository.mark_unread(db, notification)
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


def delete_notification(db: Session, user_id: int, notification_id: int) -> None:
    notification = repository.get_for_user(db, user_id, notification_id)
    if notification is None:
        raise _not_found()
    try:
        repository.delete_notification(db, notification)
        db.commit()
    except Exception:
        db.rollback()
        raise


def delete_all_notifications(db: Session, user_id: int) -> int:
    try:
        count = repository.delete_all_for_user(db, user_id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return count


def unread_count(db: Session, user_id: int) -> UnreadCountResponse:
    return UnreadCountResponse(count=repository.count_unread(db, user_id))


def get_or_create_preference(db: Session, user_id: int) -> NotificationPreference:
    preference = repository.get_preference(db, user_id)
    if preference is not None:
        return preference
    preference = repository.create_preference(db, user_id)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        preference = repository.get_preference(db, user_id)
        if preference is None:
            raise
    return preference


def get_preferences(db: Session, user_id: int) -> NotificationPreferenceResponse:
    preference = get_or_create_preference(db, user_id)
    db.commit()
    db.refresh(preference)
    return NotificationPreferenceResponse.model_validate(preference)


def update_preferences(db: Session, user_id: int, data: NotificationPreferenceUpdate) -> NotificationPreferenceResponse:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Update body must not be empty")

    preference = get_or_create_preference(db, user_id)
    for field, value in updates.items():
        setattr(preference, field, value)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(preference)
    return NotificationPreferenceResponse.model_validate(preference)


def add_notification(db: Session, *, user_id: int, type: str, title: str, message: str, **extra):
    """Create a notification in the current session without committing."""
    return repository.create(
        db,
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        **extra,
    )