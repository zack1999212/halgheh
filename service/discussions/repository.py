from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..auth.models import User
from .models import ProjectDiscussion, ProjectDiscussionReaction, ProjectDiscussionReply


# --- Discussions ---


def create_discussion(db: Session, **fields) -> ProjectDiscussion:
    obj = ProjectDiscussion(**fields)
    db.add(obj)
    db.flush()
    return obj


def get_discussion(db: Session, discussion_id: int) -> ProjectDiscussion | None:
    return db.get(ProjectDiscussion, discussion_id)


def get_discussion_for_project(
    db: Session, project_id: int, discussion_id: int, *, include_deleted: bool = False
) -> ProjectDiscussion | None:
    stmt = (
        select(ProjectDiscussion)
        .options(joinedload(ProjectDiscussion.author))
        .where(
            ProjectDiscussion.id == discussion_id,
            ProjectDiscussion.project_id == project_id,
        )
    )
    if not include_deleted:
        stmt = stmt.where(ProjectDiscussion.deleted_at.is_(None))
    return db.scalars(stmt).first()


def list_discussions(
    db: Session,
    project_id: int,
    *,
    discussion_type: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[ProjectDiscussion], int]:
    stmt = (
        select(ProjectDiscussion)
        .options(joinedload(ProjectDiscussion.author))
        .where(
            ProjectDiscussion.project_id == project_id,
            ProjectDiscussion.deleted_at.is_(None),
        )
    )
    if discussion_type is not None:
        stmt = stmt.where(ProjectDiscussion.type == discussion_type)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = (
        stmt.order_by(
            ProjectDiscussion.is_pinned.desc(),
            ProjectDiscussion.created_at.desc(),
            ProjectDiscussion.id.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt).all()), int(total or 0)


def soft_delete_discussion(db: Session, discussion: ProjectDiscussion, *, deleted_at) -> None:
    discussion.deleted_at = deleted_at


# --- Replies ---


def create_reply(db: Session, **fields) -> ProjectDiscussionReply:
    obj = ProjectDiscussionReply(**fields)
    db.add(obj)
    db.flush()
    return obj


def get_reply(db: Session, reply_id: int) -> ProjectDiscussionReply | None:
    return db.get(ProjectDiscussionReply, reply_id)


def get_reply_for_discussion(
    db: Session,
    discussion_id: int,
    reply_id: int,
    *,
    include_deleted: bool = False,
) -> ProjectDiscussionReply | None:
    stmt = (
        select(ProjectDiscussionReply)
        .options(joinedload(ProjectDiscussionReply.author))
        .where(
            ProjectDiscussionReply.id == reply_id,
            ProjectDiscussionReply.discussion_id == discussion_id,
        )
    )
    if not include_deleted:
        stmt = stmt.where(ProjectDiscussionReply.deleted_at.is_(None))
    return db.scalars(stmt).first()


def list_replies(
    db: Session,
    discussion_id: int,
    *,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[ProjectDiscussionReply], int]:
    # Include soft-deleted replies as placeholders in their original positions.
    stmt = (
        select(ProjectDiscussionReply)
        .options(joinedload(ProjectDiscussionReply.author))
        .where(ProjectDiscussionReply.discussion_id == discussion_id)
        .order_by(ProjectDiscussionReply.created_at.asc(), ProjectDiscussionReply.id.asc())
    )
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = stmt.limit(limit).offset(offset)
    return list(db.scalars(stmt).all()), int(total or 0)


def soft_delete_reply(db: Session, reply: ProjectDiscussionReply, *, deleted_at) -> None:
    reply.deleted_at = deleted_at


# --- Counts / aggregations ---


def get_reply_counts(db: Session, discussion_ids: list[int]) -> dict[int, int]:
    if not discussion_ids:
        return {}
    stmt = (
        select(ProjectDiscussionReply.discussion_id, func.count(ProjectDiscussionReply.id))
        .where(
            ProjectDiscussionReply.discussion_id.in_(discussion_ids),
            ProjectDiscussionReply.deleted_at.is_(None),
        )
        .group_by(ProjectDiscussionReply.discussion_id)
    )
    return {int(did): int(count) for did, count in db.execute(stmt).all()}


def get_discussion_reaction_summaries(
    db: Session, discussion_ids: list[int], *, viewer_id: int
) -> dict[int, list[dict]]:
    if not discussion_ids:
        return {}
    stmt = (
        select(
            ProjectDiscussionReaction.discussion_id,
            ProjectDiscussionReaction.emoji,
            func.count(ProjectDiscussionReaction.id).label("count"),
            func.bool_or(ProjectDiscussionReaction.user_id == viewer_id).label("reacted_by_me"),
        )
        .where(ProjectDiscussionReaction.discussion_id.in_(discussion_ids))
        .group_by(ProjectDiscussionReaction.discussion_id, ProjectDiscussionReaction.emoji)
        .order_by(ProjectDiscussionReaction.emoji.asc())
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
            ProjectDiscussionReaction.reply_id,
            ProjectDiscussionReaction.emoji,
            func.count(ProjectDiscussionReaction.id).label("count"),
            func.bool_or(ProjectDiscussionReaction.user_id == viewer_id).label("reacted_by_me"),
        )
        .where(ProjectDiscussionReaction.reply_id.in_(reply_ids))
        .group_by(ProjectDiscussionReaction.reply_id, ProjectDiscussionReaction.emoji)
        .order_by(ProjectDiscussionReaction.emoji.asc())
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
) -> ProjectDiscussionReaction | None:
    stmt = select(ProjectDiscussionReaction).where(
        ProjectDiscussionReaction.discussion_id == discussion_id,
        ProjectDiscussionReaction.user_id == user_id,
        ProjectDiscussionReaction.emoji == emoji,
    )
    return db.scalars(stmt).first()


def get_reaction_for_reply(
    db: Session, reply_id: int, user_id: int, emoji: str
) -> ProjectDiscussionReaction | None:
    stmt = select(ProjectDiscussionReaction).where(
        ProjectDiscussionReaction.reply_id == reply_id,
        ProjectDiscussionReaction.user_id == user_id,
        ProjectDiscussionReaction.emoji == emoji,
    )
    return db.scalars(stmt).first()


def create_reaction(db: Session, **fields) -> ProjectDiscussionReaction:
    obj = ProjectDiscussionReaction(**fields)
    db.add(obj)
    db.flush()
    return obj


def delete_reaction(db: Session, reaction: ProjectDiscussionReaction) -> None:
    db.delete(reaction)
    db.flush()
