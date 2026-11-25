"""Repository layer for workspace milestones.

Pure SQLAlchemy query construction: no HTTP errors, no commits.
"""

from __future__ import annotations

from sqlalchemy import func, nullslast, select
from sqlalchemy.orm import Session

from .models import Milestone, MilestoneStep, MilestoneStepTask


def create_milestone(db: Session, **fields) -> Milestone:
    milestone = Milestone(**fields)
    db.add(milestone)
    db.flush()
    return milestone


def get_milestone_for_workspace(
    db: Session, workspace_id: int, milestone_id: int
) -> Milestone | None:
    stmt = select(Milestone).where(
        Milestone.workspace_id == workspace_id,
        Milestone.id == milestone_id,
    )
    return db.scalars(stmt).first()


def list_milestones(
    db: Session, workspace_id: int, *, limit: int = 50, offset: int = 0
) -> tuple[list[Milestone], int]:
    stmt = select(Milestone).where(Milestone.workspace_id == workspace_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = (
        stmt.order_by(
            Milestone.position.asc(),
            nullslast(Milestone.due_date.asc()),
            Milestone.created_at.asc(),
            Milestone.id.asc(),
        )
        .limit(limit)
        .offset(offset)
    )
    items = list(db.scalars(stmt).all())
    for milestone in items:
        _ = list(milestone.steps)
    return items, int(total or 0)


def list_all_milestones_for_workspace(
    db: Session, workspace_id: int
) -> list[Milestone]:
    stmt = (
        select(Milestone)
        .where(Milestone.workspace_id == workspace_id)
        .order_by(
            Milestone.position.asc(),
            nullslast(Milestone.due_date.asc()),
            Milestone.created_at.asc(),
            Milestone.id.asc(),
        )
    )
    items = list(db.scalars(stmt).all())
    for milestone in items:
        _ = list(milestone.steps)
    return items


def get_next_milestone_position(db: Session, workspace_id: int) -> int:
    stmt = select(func.coalesce(func.max(Milestone.position), -1)).where(
        Milestone.workspace_id == workspace_id
    )
    return int(db.scalar(stmt) or -1) + 1


def delete_milestone(db: Session, milestone: Milestone) -> None:
    db.delete(milestone)


def create_step(db: Session, **fields) -> MilestoneStep:
    step = MilestoneStep(**fields)
    db.add(step)
    db.flush()
    return step


def get_step_for_milestone(
    db: Session, milestone_id: int, step_id: int
) -> MilestoneStep | None:
    stmt = select(MilestoneStep).where(
        MilestoneStep.milestone_id == milestone_id,
        MilestoneStep.id == step_id,
    )
    return db.scalars(stmt).first()


def list_steps(db: Session, milestone_id: int) -> list[MilestoneStep]:
    stmt = (
        select(MilestoneStep)
        .where(MilestoneStep.milestone_id == milestone_id)
        .order_by(MilestoneStep.position.asc(), MilestoneStep.id.asc())
    )
    return list(db.scalars(stmt).all())


def get_next_step_position(db: Session, milestone_id: int) -> int:
    stmt = select(func.coalesce(func.max(MilestoneStep.position), -1)).where(
        MilestoneStep.milestone_id == milestone_id
    )
    return int(db.scalar(stmt) or -1) + 1


def delete_step(db: Session, step: MilestoneStep) -> None:
    db.delete(step)


def add_step_task(db: Session, step_id: int, task_id: int) -> MilestoneStepTask:
    link = MilestoneStepTask(step_id=step_id, task_id=task_id)
    db.add(link)
    db.flush()
    return link


def replace_step_tasks(db: Session, step: MilestoneStep, task_ids: list[int]) -> None:
    """Replace a step's task links. Tasks themselves are never modified."""
    db.query(MilestoneStepTask).filter(
        MilestoneStepTask.step_id == step.id
    ).delete(synchronize_session=False)
    for task_id in task_ids:
        db.add(MilestoneStepTask(step_id=step.id, task_id=task_id))
    db.flush()
    db.expire(step, ["task_links"])
