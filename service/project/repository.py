"""Repository layer for the project module.

Pure SQLAlchemy query construction. Functions take a Session as the first
argument, return ORM instances or tuples, raise no HTTP errors, and perform no
commits.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import Select, func, literal, nullslast, select, union_all
from sqlalchemy.orm import Session

from ..auth.models import User
from .models import Project, ProjectInvitation, ProjectMember, ProjectMilestone, ProjectMilestoneStep


def create_project(db: Session, **fields) -> Project:
    project = Project(**fields)
    db.add(project)
    db.flush()
    return project


def get_project(db: Session, project_id: int) -> Project | None:
    return db.get(Project, project_id)


def _apply_project_filters(stmt: Select, *, status: str | None = None) -> Select:
    if status is not None:
        stmt = stmt.where(Project.status == status)
    return stmt


def list_projects_for_user(
    db: Session,
    user_id: int,
    *,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[tuple[Project, str]], int]:
    """List projects owned by or joined by the user with their role.

    Returns ([(project, role), ...], total). Owner rows use role 'owner';
    joined rows use the accepted member role. No duplicates.
    """
    owned = select(
        Project.id.label("project_id"),
        literal("owner").label("user_role"),
    ).where(Project.owner_id == user_id)

    joined = select(
        ProjectMember.project_id.label("project_id"),
        ProjectMember.role.label("user_role"),
    ).where(ProjectMember.user_id == user_id)

    accessible = union_all(owned, joined).subquery()

    stmt = select(Project, accessible.c.user_role).join(
        accessible, accessible.c.project_id == Project.id
    )
    stmt = _apply_project_filters(stmt, status=status)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt)

    stmt = stmt.order_by(Project.updated_at.desc(), Project.id.desc()).limit(limit).offset(offset)
    rows = db.execute(stmt).all()
    items = [(row[0], row[1]) for row in rows]
    return items, int(total or 0)


def delete_project(db: Session, project: Project) -> None:
    db.delete(project)


# --- Milestones ---


def create_milestone(db: Session, **fields) -> ProjectMilestone:
    milestone = ProjectMilestone(**fields)
    db.add(milestone)
    db.flush()
    return milestone


def get_milestone_for_project(
    db: Session, project_id: int, milestone_id: int
) -> ProjectMilestone | None:
    stmt = select(ProjectMilestone).where(
        ProjectMilestone.project_id == project_id,
        ProjectMilestone.id == milestone_id,
    )
    return db.scalars(stmt).first()


def list_milestones(
    db: Session, project_id: int, *, limit: int = 50, offset: int = 0
) -> tuple[list[ProjectMilestone], int]:
    """Milestones of one project in roadmap order."""
    stmt = select(ProjectMilestone).where(ProjectMilestone.project_id == project_id)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = (
        stmt.order_by(
            ProjectMilestone.position.asc(),
            nullslast(ProjectMilestone.due_date.asc()),
            ProjectMilestone.created_at.asc(),
            ProjectMilestone.id.asc(),
        )
        .limit(limit)
        .offset(offset)
    )
    items = list(db.scalars(stmt).all())
    for m in items:
        # Ensure steps are loaded in configured order for serialization.
        _ = list(m.steps)
    return items, int(total or 0)


def list_all_milestones_for_project(db: Session, project_id: int) -> list[ProjectMilestone]:
    stmt = (
        select(ProjectMilestone)
        .where(ProjectMilestone.project_id == project_id)
        .order_by(
            ProjectMilestone.position.asc(),
            nullslast(ProjectMilestone.due_date.asc()),
            ProjectMilestone.created_at.asc(),
            ProjectMilestone.id.asc(),
        )
    )
    items = list(db.scalars(stmt).all())
    for m in items:
        _ = list(m.steps)
    return items


def get_next_milestone_position(db: Session, project_id: int) -> int:
    stmt = select(func.coalesce(func.max(ProjectMilestone.position), -1)).where(
        ProjectMilestone.project_id == project_id
    )
    return int(db.scalar(stmt) or -1) + 1


def delete_milestone(db: Session, milestone: ProjectMilestone) -> None:
    db.delete(milestone)


def count_milestones_by_status(db: Session, project_id: int) -> dict[str, int]:
    stmt = (
        select(ProjectMilestone.status, func.count())
        .where(ProjectMilestone.project_id == project_id)
        .group_by(ProjectMilestone.status)
    )
    return {str(status): int(count) for status, count in db.execute(stmt).all()}


def list_upcoming_milestones(
    db: Session, project_id: int, *, as_of: date, limit: int = 5
) -> list[ProjectMilestone]:
    """Upcoming roadmap milestones (not completed/cancelled) with due dates."""
    stmt = (
        select(ProjectMilestone)
        .where(
            ProjectMilestone.project_id == project_id,
            ProjectMilestone.status.notin_(("completed", "cancelled")),
            ProjectMilestone.due_date.is_not(None),
            ProjectMilestone.due_date >= as_of,
        )
        .order_by(
            ProjectMilestone.due_date.asc(),
            ProjectMilestone.position.asc(),
            ProjectMilestone.created_at.asc(),
            ProjectMilestone.id.asc(),
        )
        .limit(limit)
    )
    items = list(db.scalars(stmt).all())
    for m in items:
        _ = list(m.steps)
    return items


# --- Milestone steps ---


def create_step(db: Session, **fields) -> ProjectMilestoneStep:
    step = ProjectMilestoneStep(**fields)
    db.add(step)
    db.flush()
    return step


def get_step_for_milestone(
    db: Session, milestone_id: int, step_id: int
) -> ProjectMilestoneStep | None:
    stmt = select(ProjectMilestoneStep).where(
        ProjectMilestoneStep.milestone_id == milestone_id,
        ProjectMilestoneStep.id == step_id,
    )
    return db.scalars(stmt).first()


def list_steps(db: Session, milestone_id: int) -> list[ProjectMilestoneStep]:
    stmt = (
        select(ProjectMilestoneStep)
        .where(ProjectMilestoneStep.milestone_id == milestone_id)
        .order_by(ProjectMilestoneStep.position.asc(), ProjectMilestoneStep.id.asc())
    )
    return list(db.scalars(stmt).all())


def get_next_step_position(db: Session, milestone_id: int) -> int:
    stmt = select(func.coalesce(func.max(ProjectMilestoneStep.position), -1)).where(
        ProjectMilestoneStep.milestone_id == milestone_id
    )
    return int(db.scalar(stmt) or -1) + 1


def delete_step(db: Session, step: ProjectMilestoneStep) -> None:
    db.delete(step)


# --- Members ---


def count_members_by_role(db: Session, project_id: int) -> dict[str, int]:
    """Accepted project members grouped by role (owner excluded by design)."""
    stmt = (
        select(ProjectMember.role, func.count())
        .where(ProjectMember.project_id == project_id)
        .group_by(ProjectMember.role)
    )
    return {str(role): int(count) for role, count in db.execute(stmt).all()}


def get_member(db: Session, project_id: int, user_id: int) -> ProjectMember | None:
    stmt = select(ProjectMember).where(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    )
    return db.scalars(stmt).first()


def get_member_by_id(db: Session, project_id: int, member_id: int) -> ProjectMember | None:
    stmt = select(ProjectMember).where(
        ProjectMember.project_id == project_id,
        ProjectMember.id == member_id,
    )
    return db.scalars(stmt).first()


def list_members(db: Session, project_id: int) -> list[ProjectMember]:
    stmt = (
        select(ProjectMember)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.joined_at.asc(), ProjectMember.id.asc())
    )
    return list(db.scalars(stmt).all())


def create_member(db: Session, **fields) -> ProjectMember:
    member = ProjectMember(**fields)
    db.add(member)
    db.flush()
    return member


def delete_member(db: Session, member: ProjectMember) -> None:
    db.delete(member)


# --- Invitations ---


def create_invitation(db: Session, **fields) -> ProjectInvitation:
    invitation = ProjectInvitation(**fields)
    db.add(invitation)
    db.flush()
    return invitation


def get_invitation(db: Session, invitation_id: int) -> ProjectInvitation | None:
    return db.get(ProjectInvitation, invitation_id)


def get_invitation_for_project(
    db: Session, project_id: int, invitation_id: int
) -> ProjectInvitation | None:
    stmt = select(ProjectInvitation).where(
        ProjectInvitation.project_id == project_id,
        ProjectInvitation.id == invitation_id,
    )
    return db.scalars(stmt).first()


def list_project_invitations(db: Session, project_id: int) -> list[ProjectInvitation]:
    stmt = (
        select(ProjectInvitation)
        .where(ProjectInvitation.project_id == project_id)
        .order_by(ProjectInvitation.created_at.desc(), ProjectInvitation.id.desc())
    )
    return list(db.scalars(stmt).all())


def list_received_invitations(db: Session, invitee_id: int) -> list[ProjectInvitation]:
    stmt = (
        select(ProjectInvitation)
        .where(ProjectInvitation.invitee_id == invitee_id)
        .order_by(ProjectInvitation.created_at.desc(), ProjectInvitation.id.desc())
    )
    return list(db.scalars(stmt).all())


def get_pending_invitation_for_user(
    db: Session, project_id: int, invitee_id: int
) -> ProjectInvitation | None:
    stmt = select(ProjectInvitation).where(
        ProjectInvitation.project_id == project_id,
        ProjectInvitation.invitee_id == invitee_id,
        ProjectInvitation.status == "pending",
    )
    return db.scalars(stmt).first()


# --- Users ---


def get_user(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def find_user_by_username(db: Session, username: str) -> User | None:
    """Resolve an invited account by username (case-insensitive, trimmed)."""
    normalized = username.strip()
    if not normalized:
        return None
    stmt = select(User).where(func.lower(User.username) == normalized.lower())
    return db.scalars(stmt).first()


# --- Tasks (project-scoped aggregation; no ORM loading) ---


def count_tasks_by_status(db: Session, project_id: int) -> dict[str, int]:
    """Eligible project tasks grouped by status.

    Eligibility for project progress/metrics is every task record associated
    with the project (``project_id`` match), including parent tasks and
    subtasks, each counted once by its own status. Personal tasks, tasks in
    other projects, and nonexistent (hard-deleted) tasks are excluded. No
    task statuses are introduced or inferred here.
    """
    from ..task.models import Task

    stmt = (
        select(Task.status, func.count())
        .where(Task.project_id == project_id)
        .group_by(Task.status)
    )
    return {str(status): int(count) for status, count in db.execute(stmt).all()}
