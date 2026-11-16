from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AICredential


def create(
    db: Session,
    *,
    user_id: int,
    provider: str,
    model: str,
    base_url: str | None,
    name: str | None,
    api_key_encrypted: str,
    extra_config: dict[str, Any] | None,
    is_active: bool,
) -> AICredential:
    credential = AICredential(
        user_id=user_id,
        provider=provider,
        model=model,
        base_url=base_url,
        name=name,
        api_key_encrypted=api_key_encrypted,
        extra_config=extra_config,
        is_active=is_active,
    )
    db.add(credential)
    return credential


def list_for_user(db: Session, user_id: int) -> list[AICredential]:
    stmt = (
        select(AICredential)
        .where(AICredential.user_id == user_id)
        .order_by(
            AICredential.is_active.desc(),
            AICredential.created_at.desc(),
            AICredential.id.desc(),
        )
    )
    return list(db.scalars(stmt).all())


def get_for_user(
    db: Session, user_id: int, credential_id: int
) -> AICredential | None:
    stmt = select(AICredential).where(
        AICredential.id == credential_id,
        AICredential.user_id == user_id,
    )
    return db.scalars(stmt).first()


def get_active_for_user(db: Session, user_id: int) -> AICredential | None:
    stmt = select(AICredential).where(
        AICredential.user_id == user_id,
        AICredential.is_active.is_(True),
    )
    return db.scalars(stmt).first()


def deactivate_all(db: Session, user_id: int) -> list[AICredential]:
    active = list(
        db.scalars(
            select(AICredential).where(
                AICredential.user_id == user_id,
                AICredential.is_active.is_(True),
            )
        ).all()
    )
    for credential in active:
        credential.is_active = False
    return active


def delete(db: Session, credential: AICredential) -> None:
    db.delete(credential)
