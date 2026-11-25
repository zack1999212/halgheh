from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..workspace import permissions as workspace_permissions
from ..workspace import service as workspace_service
from . import repository
from .models import DISCUSSION_TYPES


def _not_found(detail: str = "Discussion not found") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _forbidden(detail: str = "Not allowed to perform this action") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _commit(db: Session, *, conflict_detail: str = "Conflict") -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=conflict_detail)


def _get_workspace_role(db: Session, workspace_id: int, actor_id: int) -> str:
    return workspace_service.get_accessible_workspace(db, workspace_id, actor_id)[1]


def _require_workspace_view(db: Session, workspace_id: int, actor_id: int):
    return workspace_service.get_accessible_workspace(db, workspace_id, actor_id)


def _require_discussion_access(db: Session, workspace_id: int, discussion_id: int, actor_id: int):
    _require_workspace_view(db, workspace_id, actor_id)
    discussion = repository.get_discussion_for_workspace(db, workspace_id, discussion_id)
    if discussion is None:
        raise _not_found()
    return discussion


def _require_reply_access(db: Session, workspace_id: int, discussion_id: int, reply_id: int, actor_id: int):
    discussion = _require_discussion_access(db, workspace_id, discussion_id, actor_id)
    reply = repository.get_reply_for_discussion(db, discussion_id, reply_id)
    if reply is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reply not found")
    return discussion, reply


def _serialize_author(user) -> dict | None:
    if user is None:
        return None
    return {
        "id": user.id,
        "username": getattr(user, "username", None),
        "name": getattr(user, "name", None),
        "avatar_url": getattr(user, "avatar_url", None),
    }


def _reaction_summaries_to_viewer(reactions: list[dict]) -> list[str]:
    return [r["emoji"] for r in reactions if r.get("reacted_by_me")]


def _serialize_discussion(
    discussion,
    *,
    reply_count: int = 0,
    reactions: list[dict] | None = None,
) -> dict:
    reaction_items = reactions or []
    return {
        "id": discussion.id,
        "workspace_id": discussion.workspace_id,
        "author_id": discussion.author_id,
        "author": _serialize_author(getattr(discussion, "author", None)),
        "type": discussion.type,
        "title": discussion.title,
        "content": discussion.content,
        "is_pinned": discussion.is_pinned,
        "reply_count": reply_count,
        "reactions": reaction_items,
        "viewer_reactions": _reaction_summaries_to_viewer(reaction_items),
        "created_at": discussion.created_at,
        "updated_at": discussion.updated_at,
    }


def _serialize_reply(reply, *, reactions: list[dict] | None = None) -> dict:
    reaction_items = reactions or []
    is_deleted = reply.deleted_at is not None
    return {
        "id": reply.id,
        "discussion_id": reply.discussion_id,
        "author_id": None if is_deleted else reply.author_id,
        "author": None if is_deleted else _serialize_author(getattr(reply, "author", None)),
        "content": None if is_deleted else reply.content,
        "is_deleted": is_deleted,
        "reactions": reaction_items,
        "viewer_reactions": _reaction_summaries_to_viewer(reaction_items),
        "created_at": reply.created_at,
        "updated_at": reply.updated_at,
        "deleted_at": reply.deleted_at,
    }


# --- Discussions ---


def list_discussions(
    db: Session,
    workspace_id: int,
    actor_id: int,
    *,
    discussion_type: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    _require_workspace_view(db, workspace_id, actor_id)
    if discussion_type is not None and discussion_type not in DISCUSSION_TYPES:
        raise _bad_request(f"Unknown discussion type: {discussion_type}")

    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)

    items, total = repository.list_discussions(
        db,
        workspace_id,
        discussion_type=discussion_type,
        limit=limit,
        offset=offset,
    )
    discussion_ids = [d.id for d in items]
    reply_counts = repository.get_reply_counts(db, discussion_ids)
    reaction_map = repository.get_discussion_reaction_summaries(db, discussion_ids, viewer_id=actor_id)

    return [
        _serialize_discussion(
            d,
            reply_count=reply_counts.get(d.id, 0),
            reactions=reaction_map.get(d.id, []),
        )
        for d in items
    ], total


def create_discussion(db: Session, workspace_id: int, actor_id: int, data) -> dict:
    # Every workspace member can start a discussion; the author is the caller.
    _require_workspace_view(db, workspace_id, actor_id)

    discussion = repository.create_discussion(
        db,
        workspace_id=workspace_id,
        author_id=actor_id,
        type=data.type,
        title=data.title,
        content=data.content,
        is_pinned=False,
    )
    _commit(db, conflict_detail="Could not create discussion")
    discussion = repository.get_discussion_for_workspace(db, workspace_id, discussion.id)
    return _serialize_discussion(discussion, reply_count=0, reactions=[])


def get_discussion(db: Session, workspace_id: int, discussion_id: int, actor_id: int) -> dict:
    discussion = _require_discussion_access(db, workspace_id, discussion_id, actor_id)
    reply_counts = repository.get_reply_counts(db, [discussion.id])
    reaction_map = repository.get_discussion_reaction_summaries(db, [discussion.id], viewer_id=actor_id)
    return _serialize_discussion(
        discussion,
        reply_count=reply_counts.get(discussion.id, 0),
        reactions=reaction_map.get(discussion.id, []),
    )


def update_discussion(db: Session, workspace_id: int, discussion_id: int, actor_id: int, data) -> dict:
    discussion = _require_discussion_access(db, workspace_id, discussion_id, actor_id)
    if discussion.author_id != actor_id:
        raise _forbidden("Only the author can edit this discussion")

    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(discussion, field, value)

    if updates:
        discussion.updated_at = datetime.now(timezone.utc)

    _commit(db, conflict_detail="Could not update discussion")
    discussion = repository.get_discussion_for_workspace(db, workspace_id, discussion_id)
    reply_counts = repository.get_reply_counts(db, [discussion.id])
    reaction_map = repository.get_discussion_reaction_summaries(db, [discussion.id], viewer_id=actor_id)
    return _serialize_discussion(
        discussion,
        reply_count=reply_counts.get(discussion.id, 0),
        reactions=reaction_map.get(discussion.id, []),
    )


def delete_discussion(db: Session, workspace_id: int, discussion_id: int, actor_id: int) -> None:
    discussion = _require_discussion_access(db, workspace_id, discussion_id, actor_id)
    if discussion.author_id != actor_id:
        raise _forbidden("Only the author can delete this discussion")

    repository.soft_delete_discussion(db, discussion, deleted_at=datetime.now(timezone.utc))
    _commit(db, conflict_detail="Could not delete discussion")


def pin_discussion(db: Session, workspace_id: int, discussion_id: int, actor_id: int, *, is_pinned: bool) -> dict:
    discussion = _require_discussion_access(db, workspace_id, discussion_id, actor_id)
    role = _get_workspace_role(db, workspace_id, actor_id)
    if not workspace_permissions.can_edit_workspace(role):
        raise _forbidden("Not allowed to pin discussions")

    discussion.is_pinned = bool(is_pinned)
    _commit(db, conflict_detail="Could not update discussion pin state")
    discussion = repository.get_discussion_for_workspace(db, workspace_id, discussion_id)
    reply_counts = repository.get_reply_counts(db, [discussion.id])
    reaction_map = repository.get_discussion_reaction_summaries(db, [discussion.id], viewer_id=actor_id)
    return _serialize_discussion(
        discussion,
        reply_count=reply_counts.get(discussion.id, 0),
        reactions=reaction_map.get(discussion.id, []),
    )


# --- Replies ---


def list_replies(
    db: Session,
    workspace_id: int,
    discussion_id: int,
    actor_id: int,
    *,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    _require_discussion_access(db, workspace_id, discussion_id, actor_id)
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)

    items, total = repository.list_replies(db, discussion_id, limit=limit, offset=offset)
    reply_ids = [r.id for r in items]
    reaction_map = repository.get_reply_reaction_summaries(db, reply_ids, viewer_id=actor_id)
    return [_serialize_reply(r, reactions=reaction_map.get(r.id, [])) for r in items], total


def create_reply(db: Session, workspace_id: int, discussion_id: int, actor_id: int, data) -> dict:
    discussion = _require_discussion_access(db, workspace_id, discussion_id, actor_id)
    if discussion.deleted_at is not None:
        raise _not_found()

    reply = repository.create_reply(
        db,
        discussion_id=discussion.id,
        author_id=actor_id,
        content=data.content,
    )
    _commit(db, conflict_detail="Could not create reply")
    reply = repository.get_reply_for_discussion(db, discussion.id, reply.id, include_deleted=True)
    return _serialize_reply(reply, reactions=[])


def update_reply(
    db: Session, workspace_id: int, discussion_id: int, reply_id: int, actor_id: int, data
) -> dict:
    _discussion, reply = _require_reply_access(db, workspace_id, discussion_id, reply_id, actor_id)
    if reply.author_id != actor_id:
        raise _forbidden("Only the author can edit this reply")

    reply.content = data.content
    reply.updated_at = datetime.now(timezone.utc)
    _commit(db, conflict_detail="Could not update reply")
    reply = repository.get_reply_for_discussion(db, discussion_id, reply_id, include_deleted=True)
    reaction_map = repository.get_reply_reaction_summaries(db, [reply.id], viewer_id=actor_id)
    return _serialize_reply(reply, reactions=reaction_map.get(reply.id, []))


def delete_reply(db: Session, workspace_id: int, discussion_id: int, reply_id: int, actor_id: int) -> dict:
    _discussion, reply = _require_reply_access(db, workspace_id, discussion_id, reply_id, actor_id)
    if reply.author_id != actor_id:
        raise _forbidden("Only the author can delete this reply")

    if reply.deleted_at is None:
        repository.soft_delete_reply(db, reply, deleted_at=datetime.now(timezone.utc))
        _commit(db, conflict_detail="Could not delete reply")

    reply = repository.get_reply_for_discussion(db, discussion_id, reply_id, include_deleted=True)
    reaction_map = repository.get_reply_reaction_summaries(db, [reply.id], viewer_id=actor_id)
    return _serialize_reply(reply, reactions=reaction_map.get(reply.id, []))


# --- Reactions ---


def _require_reactable_discussion(db: Session, workspace_id: int, discussion_id: int, actor_id: int):
    # Workspace access was already verified; every member may react.
    return _require_discussion_access(db, workspace_id, discussion_id, actor_id)


def _require_reactable_reply(db: Session, workspace_id: int, discussion_id: int, reply_id: int, actor_id: int):
    return _require_reply_access(db, workspace_id, discussion_id, reply_id, actor_id)


def _discussion_reaction_response(db: Session, discussion_id: int, *, actor_id: int) -> dict:
    reaction_map = repository.get_discussion_reaction_summaries(db, [discussion_id], viewer_id=actor_id)
    reactions = reaction_map.get(discussion_id, [])
    return {
        "target_type": "discussion",
        "target_id": discussion_id,
        "reactions": reactions,
        "viewer_reactions": _reaction_summaries_to_viewer(reactions),
    }


def _reply_reaction_response(db: Session, reply_id: int, *, actor_id: int) -> dict:
    reaction_map = repository.get_reply_reaction_summaries(db, [reply_id], viewer_id=actor_id)
    reactions = reaction_map.get(reply_id, [])
    return {
        "target_type": "reply",
        "target_id": reply_id,
        "reactions": reactions,
        "viewer_reactions": _reaction_summaries_to_viewer(reactions),
    }


def add_discussion_reaction(db: Session, workspace_id: int, discussion_id: int, actor_id: int, *, emoji: str) -> dict:
    _require_reactable_discussion(db, workspace_id, discussion_id, actor_id)
    existing = repository.get_reaction_for_discussion(db, discussion_id, actor_id, emoji)
    if existing is None:
        repository.create_reaction(
            db,
            discussion_id=discussion_id,
            reply_id=None,
            user_id=actor_id,
            emoji=emoji,
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            # Concurrent duplicate insert: treat as idempotent success.
    return _discussion_reaction_response(db, discussion_id, actor_id=actor_id)


def remove_discussion_reaction(db: Session, workspace_id: int, discussion_id: int, actor_id: int, *, emoji: str) -> dict:
    _require_reactable_discussion(db, workspace_id, discussion_id, actor_id)
    existing = repository.get_reaction_for_discussion(db, discussion_id, actor_id, emoji)
    if existing is not None:
        repository.delete_reaction(db, existing)
        _commit(db, conflict_detail="Could not remove reaction")
    return _discussion_reaction_response(db, discussion_id, actor_id=actor_id)


def add_reply_reaction(
    db: Session, workspace_id: int, discussion_id: int, reply_id: int, actor_id: int, *, emoji: str
) -> dict:
    _discussion, _reply = _require_reactable_reply(db, workspace_id, discussion_id, reply_id, actor_id)
    existing = repository.get_reaction_for_reply(db, reply_id, actor_id, emoji)
    if existing is None:
        repository.create_reaction(
            db,
            discussion_id=None,
            reply_id=reply_id,
            user_id=actor_id,
            emoji=emoji,
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            # Concurrent duplicate insert: treat as idempotent success.
    return _reply_reaction_response(db, reply_id, actor_id=actor_id)


def remove_reply_reaction(
    db: Session, workspace_id: int, discussion_id: int, reply_id: int, actor_id: int, *, emoji: str
) -> dict:
    _discussion, _reply = _require_reactable_reply(db, workspace_id, discussion_id, reply_id, actor_id)
    existing = repository.get_reaction_for_reply(db, reply_id, actor_id, emoji)
    if existing is not None:
        repository.delete_reaction(db, existing)
        _commit(db, conflict_detail="Could not remove reaction")
    return _reply_reaction_response(db, reply_id, actor_id=actor_id)
