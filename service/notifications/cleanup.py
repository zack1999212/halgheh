from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from . import repository

logger = logging.getLogger("halgheh.notifications.cleanup")

NOTIFICATION_CLEANUP_BATCH_SIZE = 100
NOTIFICATION_CLEANUP_INTERVAL_SECONDS = int(os.getenv("NOTIFICATION_CLEANUP_INTERVAL_SECONDS", "300"))


def get_notification_retention_days() -> int:
    raw = os.getenv("NOTIFICATION_RETENTION_DAYS", "90")
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError("NOTIFICATION_RETENTION_DAYS must be an integer") from exc
    if value <= 0:
        raise ValueError("NOTIFICATION_RETENTION_DAYS must be greater than zero")
    return value


def cleanup_expired_notifications(db: Session, *, now: datetime | None = None) -> int:
    retention_days = get_notification_retention_days()
    if now is None:
        now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=retention_days)
    total_deleted = 0
    while True:
        try:
            deleted = repository.delete_expired_batch(db, cutoff, NOTIFICATION_CLEANUP_BATCH_SIZE)
            db.commit()
        except Exception:
            db.rollback()
            raise
        total_deleted += deleted
        if deleted < NOTIFICATION_CLEANUP_BATCH_SIZE:
            break
    if total_deleted:
        logger.info("Deleted %s expired notifications", total_deleted)
    return total_deleted