from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..auth.models import User
from .models import WorkspaceDiscussion, WorkspaceDiscussionReaction, WorkspaceDiscussionReply


# --- Discussions ---


def create_discussion(db: Session, **fields) -> WorkspaceDiscussion:
    obj = WorkspaceDiscussion(**fields)
    db.add(obj)
    db.flush()
    return obj


def get_discussion(db: Session, discussion_id: int) -> WorkspaceDiscussion | None:
    return db.get(WorkspaceDiscussion, discussion_id)


def get_discussion_for_workspace(
    db: Session, workspace_id: int, discussion_id: int, *, include_deleted: bool = False
) -> WorkspaceDiscussion | None:
    stmt = (
        select(WorkspaceDiscussion)
        .options(joinedload(WorkspaceDiscussion.author))
        .where(
            WorkspaceDiscussion.id == discussion_id,
            WorkspaceDiscussion.workspace_id == workspace_id,
        )
    )
    if not include_deleted:
        stmt = stmt.where(WorkspaceDiscussion.deleted_at.is_(None))
    return db.scalars(stmt).first()


def list_discussions(
    db: Session,
    workspace_id: int,
    *,
    discussion_type: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[WorkspaceDiscussion], int]:
    stmt = (
        select(WorkspaceDiscussion)
        .options(joinedload(WorkspaceDiscussion.author))
        .where(
            WorkspaceDiscussion.workspace_id == workspace_id,
            WorkspaceDiscussion.deleted_at.is_(None),
        )
    )
    if discussion_type is not None:
        stmt = stmt.where(WorkspaceDiscussion.type == discussion_type)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = (
        stmt.order_by(
            WorkspaceDiscussion.is_pinned.desc(),
            WorkspaceDiscussion.created_at.desc(),
            WorkspaceDiscussion.id.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt).all()), int(total or 0)


def soft_delete_discussion(db: Session, discussion: WorkspaceDiscussion, *, deleted_at) -> None:
    discussion.deleted_at = deleted_at


# --- Replies ---


def create_reply(db: Session, **fields) -> WorkspaceDiscussionReply:
    obj = WorkspaceDiscussionReply(**fields)
    db.add(obj)
    db.flush()
    return obj


def get_reply(db: Session, reply_id: int) -> WorkspaceDiscussionReply | None:
    return db.get(WorkspaceDiscussionReply, reply_id)


def get_reply_for_discussion(
    db: Session,
    discussion_id: int,
    reply_id: int,
    *,
    include_deleted: bool = False,
) -> WorkspaceDiscussionReply | None:
    stmt = (
        select(WorkspaceDiscussionReply)
        .options(joinedload(WorkspaceDiscussionReply.author))
        .where(
            WorkspaceDiscussionReply.id == reply_id,
            WorkspaceDiscussionReply.discussion_id == discussion_id,
        )
    )
    if not include_deleted:
        stmt = stmt.where(WorkspaceDiscussionReply.deleted_at.is_(None))
    return db.scalars(stmt).first()


def list_replies(
    db: Session,
    discussion_id: int,
    *,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[WorkspaceDiscussionReply], int]:
    # Include soft-deleted replies as placeholders in their original positions.
    stmt = (
        select(WorkspaceDiscussionReply)
        .options(joinedload(WorkspaceDiscussionReply.author))
        .where(WorkspaceDiscussionReply.discussion_id == discussion_id)
        .order_by(WorkspaceDiscussionReply.created_at.asc(), WorkspaceDiscussionReply.id.asc())
    )
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = stmt.limit(limit).offset(offset)
    return list(db.scalars(stmt).all()), int(total or 0)


def soft_delete_reply(db: Session, reply: WorkspaceDiscussionReply, *, deleted_at) -> None:
    reply.deleted_at = deleted_at


# --- Counts / aggregations ---


def get_reply_counts(db: Session, discussion_ids: list[int]) -> dict[int, int]:
    if not discussion_ids:
        return {}
    stmt = (
        select(WorkspaceDiscussionReply.discussion_id, func.count(WorkspaceDiscussionReply.id))
        .where(
            WorkspaceDiscussionReply.discussion_id.in_(discussion_ids),
            WorkspaceDiscussionReply.deleted_at.is_(None),
        )
        .group_by(WorkspaceDiscussionReply.discussion_id)
    )
    return {int(did): int(count) for did, count in db.execute(stmt).all()}


def get_discussion_reaction_summaries(
    db: Session, discussion_ids: list[int], *, viewer_id: int
) -> dict[int, list[dict]]:
    if not discussion_ids:
        return {}
    stmt = (
        select(
            WorkspaceDiscussionReaction.discussion_id,
            WorkspaceDiscussionReaction.emoji,
            func.count(WorkspaceDiscussionReaction.id).label("count"),
            func.bool_or(WorkspaceDiscussionReaction.user_id == viewer_id).label("reacted_by_me"),
        )
        .where(WorkspaceDiscussionReaction.discussion_id.in_(discussion_ids))
        .group_by(WorkspaceDiscussionReaction.discussion_id, WorkspaceDiscussionReaction.emoji)
        .order_by(WorkspaceDiscussionReaction.emoji.asc())
    )
    result: dict[int, list[dict]] = {did: [] for did in discussion_ids}
    for discussion_id, emoji, count, reacted_by_me in db.execute(stmt).all():
        did = int(discussion_id)
        result.setdefault(did, []).append(
            {
                "emoji": emoji,
                "count": int(count),
                "reacted_by_me": bool(reacted_by_me),
            }
        )
    return result


def get_reply_reaction_summaries(
    db: Session, reply_ids: list[int], *, viewer_id: int
) -> dict[int, list[dict]]:
    if not reply_ids:
        return {}
    stmt = (
        select(
            WorkspaceDiscussionReaction.reply_id,
            WorkspaceDiscussionReaction.emoji,
            func.count(WorkspaceDiscussionReaction.id).label("count"),
            func.bool_or(WorkspaceDiscussionReaction.user_id == viewer_id).label("reacted_by_me"),
        )
        .where(WorkspaceDiscussionReaction.reply_id.in_(reply_ids))
        .group_by(WorkspaceDiscussionReaction.reply_id, WorkspaceDiscussionReaction.emoji)
        .order_by(WorkspaceDiscussionReaction.emoji.asc())
    )
    result: dict[int, list[dict]] = {rid: [] for rid in reply_ids}
    for reply_id, emoji, count, reacted_by_me in db.execute(stmt).all():
        rid = int(reply_id)
        result.setdefault(rid, []).append(
            {
                "emoji": emoji,
                "count": int(count),
                "reacted_by_me": bool(reacted_by_me),
            }
        )
    return result


# --- Reactions ---


def get_reaction_for_discussion(
    db: Session, discussion_id: int, user_id: int, emoji: str
) -> WorkspaceDiscussionReaction | None:
    stmt = select(WorkspaceDiscussionReaction).where(
        WorkspaceDiscussionReaction.discussion_id == discussion_id,
        WorkspaceDiscussionReaction.user_id == user_id,
        WorkspaceDiscussionReaction.emoji == emoji,
    )
    return db.scalars(stmt).first()


def get_reaction_for_reply(
    db: Session, reply_id: int, user_id: int, emoji: str
) -> WorkspaceDiscussionReaction | None:
    stmt = select(WorkspaceDiscussionReaction).where(
        WorkspaceDiscussionReaction.reply_id == reply_id,
        WorkspaceDiscussionReaction.user_id == user_id,
        WorkspaceDiscussionReaction.emoji == emoji,
    )
    return db.scalars(stmt).first()


def create_reaction(db: Session, **fields) -> WorkspaceDiscussionReaction:
    obj = WorkspaceDiscussionReaction(**fields)
    db.add(obj)
    db.flush()
    return obj


def delete_reaction(db: Session, reaction: WorkspaceDiscussionReaction) -> None:
    db.delete(reaction)
    db.flush()
