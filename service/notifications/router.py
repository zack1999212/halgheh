from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..auth.models import User
from ..core.database import get_db
from . import service
from .schemas import (
    NotificationBulkResponse,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
    NotificationResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/preferences", response_model=NotificationPreferenceResponse)
def get_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_preferences(db, current_user.id)


@router.patch("/preferences", response_model=NotificationPreferenceResponse)
def update_preferences(
    data: NotificationPreferenceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_preferences(db, current_user.id, data)


@router.get("/unread-count", response_model=UnreadCountResponse)
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.unread_count(db, current_user.id)


@router.post("/read-all", response_model=NotificationBulkResponse)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updated = service.mark_all_read(db, current_user.id)
    return NotificationBulkResponse(updated=updated)


@router.delete("", response_model=NotificationBulkResponse)
def delete_all_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = service.delete_all_notifications(db, current_user.id)
    return NotificationBulkResponse(updated=deleted)


@router.get("", response_model=list[NotificationResponse])
def list_notifications(
    unread: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_notifications(
        db, current_user.id, limit=limit, offset=offset, unread_only=unread
    )


@router.get("/{notification_id}", response_model=NotificationResponse)
def get_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_notification(db, current_user.id, notification_id)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.mark_read(db, current_user.id, notification_id)


@router.patch("/{notification_id}/unread", response_model=NotificationResponse)
def mark_unread(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.mark_unread(db, current_user.id, notification_id)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_notification(db, current_user.id, notification_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)