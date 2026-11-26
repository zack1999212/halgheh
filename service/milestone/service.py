"""Service layer for workspace milestones.

Only the workspace owner may create or change a milestone; every workspace
member may view one. Status and progress are derived from the tasks attached
to each step, so clients never write them directly.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..task.models import Task
from ..workspace import repository as workspace_repository
from ..workspace import service as workspace_service
from . import repository
from .models import Milestone, MilestoneStep
from .schemas import (
    MilestoneCreate,
    MilestoneReorderRequest,
    MilestoneStepCreate,
    MilestoneStepReorderRequest,
    MilestoneStepUpdate,
    MilestoneUpdate,
)


def _not_found(detail: str = "Milestone not found") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _step_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone step not found")


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _commit(db: Session, conflict_detail: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=conflict_detail
        ) from exc


def _require_view(db: Session, actor_id: int, workspace_id: int):
    return workspace_service.get_accessible_workspace(db, workspace_id, actor_id)


def _require_owner(db: Session, actor_id: int, workspace_id: int):
    workspace, role = _require_view(db, actor_id, workspace_id)
    if workspace.owner_id != actor_id:
        raise _forbidden("Only the workspace owner can manage milestones")
    return workspace, role


def _get_workspace_milestone(
    db: Session, workspace_id: int, milestone_id: int
) -> Milestone:
    milestone = repository.get_milestone_for_workspace(db, workspace_id, milestone_id)
    if milestone is None:
        raise _not_found()
    return milestone


def _get_milestone_step(
    db: Session, workspace_id: int, milestone_id: int, step_id: int
) -> tuple[Milestone, MilestoneStep]:
    milestone = _get_workspace_milestone(db, workspace_id, milestone_id)
    step = repository.get_step_for_milestone(db, milestone.id, step_id)
    if step is None:
        raise _step_not_found()
    return milestone, step


def _validate_task_ids(
    db: Session, workspace_id: int, task_ids: list[int]
) -> list[Task]:
    """Ensure every task exists and is attached to this workspace."""
    if not task_ids:
        return []
    rows = db.scalars(select(Task).where(Task.id.in_(task_ids))).all()
    by_id = {task.id: task for task in rows}
    tasks = []
    for task_id in task_ids:
        task = by_id.get(task_id)
        if task is None:
            raise _bad_request(f"Task {task_id} not found")
        if not workspace_repository.has_resource_workspace(
            db, "task", task_id, workspace_id
        ):
            raise _bad_request(f"Task {task_id} is not in this workspace")
        tasks.append(task)
    return tasks


def _step_state(step: MilestoneStep):
    tasks = [
        link.task
        for link in step.task_links
        if link.task is not None
    ]
    tasks.sort(key=lambda task: (task.position, task.id))
    total = len(tasks)
    completed = sum(1 for task in tasks if task.status == "done")
    progress = 0.0 if total == 0 else round((completed / total) * 100, 2)
    is_completed = total > 0 and completed == total
    return tasks, completed, total, progress, is_completed


def _sync_milestone(milestone: Milestone) -> None:
    """Derive and persist status/completed_at from step task completion."""
    steps = list(milestone.steps)
    states = [_step_state(step) for step in steps]
    completed_steps = sum(1 for state in states if state[4])
    total_tasks = sum(state[2] for state in states)
    completed_tasks = sum(state[1] for state in states)
    if total_tasks == 0 or completed_tasks == 0:
        derived_status = "pending"
    elif completed_steps == len(steps):
        derived_status = "completed"
    else:
        derived_status = "in_progress"

    if derived_status == "completed":
        if milestone.completed_at is None:
            milestone.completed_at = datetime.now(timezone.utc)
    else:
        milestone.completed_at = None
    milestone.status = derived_status


def _serialize_task(task: Task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "description": task.description,
        "due_date": task.due_date,
    }


def _serialize_step(step: MilestoneStep) -> dict:
    tasks, completed, total, progress, is_completed = _step_state(step)
    return {
        "id": step.id,
        "milestone_id": step.milestone_id,
        "title": step.title,
        "description": step.description,
        "position": step.position,
        "tasks": [_serialize_task(task) for task in tasks],
        "completed_tasks": completed,
        "total_tasks": total,
        "progress": progress,
        "is_completed": is_completed,
        "created_at": step.created_at,
        "updated_at": step.updated_at,
    }


def _serialize_milestone(milestone: Milestone) -> dict:
    steps = sorted(
        list(milestone.steps), key=lambda step: (step.position, step.id)
    )
    step_data = [_serialize_step(step) for step in steps]
    completed_steps = sum(1 for step in step_data if step["is_completed"])
    total_steps = len(step_data)
    completed_tasks = sum(step["completed_tasks"] for step in step_data)
    total_tasks = sum(step["total_tasks"] for step in step_data)
    progress = (
        0.0 if total_tasks == 0 else round((completed_tasks / total_tasks) * 100, 2)
    )
    current_step_id = next(
        (step["id"] for step in step_data if not step["is_completed"]), None
    )
    return {
        "id": milestone.id,
        "workspace_id": milestone.workspace_id,
        "title": milestone.title,
        "description": milestone.description,
        "status": milestone.status,
        "position": milestone.position,
        "due_date": milestone.due_date,
        "completed_at": milestone.completed_at,
        "created_by": milestone.created_by,
        "created_at": milestone.created_at,
        "updated_at": milestone.updated_at,
        "progress": progress,
        "completed_steps": completed_steps,
        "total_steps": total_steps,
        "completed_tasks": completed_tasks,
        "total_tasks": total_tasks,
        "current_step_id": current_step_id,
        "steps": step_data,
    }


def _apply_step_positions(steps: list[MilestoneStep]) -> None:
    for index, step in enumerate(sorted(steps, key=lambda s: (s.position, s.id))):
        step.position = index


def _apply_milestone_positions(milestones: list[Milestone]) -> None:
    for index, milestone in enumerate(
        sorted(
            milestones,
            key=lambda m: (m.position, m.due_date or date.max, m.created_at, m.id),
        )
    ):
        milestone.position = index


def _reload(db: Session, milestone: Milestone) -> Milestone:
    db.refresh(milestone)
    db.expire(milestone, ["steps"])
    _ = list(milestone.steps)
    return milestone


def create_milestone(
    db: Session, actor_id: int, workspace_id: int, data: MilestoneCreate
) -> dict:
    workspace, _role = _require_owner(db, actor_id, workspace_id)
    position = (
        data.position
        if data.position is not None
        else repository.get_next_milestone_position(db, workspace.id)
    )
    milestone = repository.create_milestone(
        db,
        workspace_id=workspace.id,
        title=data.title,
        description=data.description,
        status="pending",
        position=position,
        due_date=data.due_date,
        completed_at=None,
        created_by=actor_id,
    )
    db.flush()

    for index, step_data in enumerate(data.steps):
        step = repository.create_step(
            db,
            milestone_id=milestone.id,
            title=step_data.title,
            description=step_data.description,
            position=step_data.position if step_data.position is not None else index,
        )
        for task in _validate_task_ids(db, workspace.id, step_data.task_ids):
            repository.add_step_task(db, step.id, task.id)
    db.flush()

    db.expire(milestone, ["steps"])
    _apply_step_positions(list(milestone.steps))
    _sync_milestone(milestone)
    _commit(db, conflict_detail="Could not create milestone")
    return _serialize_milestone(_reload(db, milestone))


def list_milestones(
    db: Session,
    actor_id: int,
    workspace_id: int,
    *,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    workspace, _role = _require_view(db, actor_id, workspace_id)
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)
    items, total = repository.list_milestones(
        db, workspace.id, limit=limit, offset=offset
    )
    changed = False
    for milestone in items:
        before = (milestone.status, milestone.completed_at)
        _sync_milestone(milestone)
        if (milestone.status, milestone.completed_at) != before:
            changed = True
    if changed:
        db.commit()
        for milestone in items:
            _reload(db, milestone)
    return [_serialize_milestone(milestone) for milestone in items], total


def get_milestone(
    db: Session, actor_id: int, workspace_id: int, milestone_id: int
) -> dict:
    workspace, _role = _require_view(db, actor_id, workspace_id)
    milestone = _get_workspace_milestone(db, workspace.id, milestone_id)
    db.expire(milestone, ["steps"])
    before = (milestone.status, milestone.completed_at)
    _sync_milestone(milestone)
    if (milestone.status, milestone.completed_at) != before:
        db.commit()
        _reload(db, milestone)
    return _serialize_milestone(milestone)


def update_milestone(
    db: Session,
    actor_id: int,
    workspace_id: int,
    milestone_id: int,
    data: MilestoneUpdate,
) -> dict:
    workspace, _role = _require_owner(db, actor_id, workspace_id)
    milestone = _get_workspace_milestone(db, workspace.id, milestone_id)
    updates = data.model_dump(exclude_unset=True)
    for field in ("title", "description", "due_date", "position"):
        if field in updates:
            setattr(milestone, field, updates[field])
    db.expire(milestone, ["steps"])
    _sync_milestone(milestone)
    _commit(db, conflict_detail="Could not update milestone")
    return _serialize_milestone(_reload(db, milestone))


def delete_milestone(
    db: Session, actor_id: int, workspace_id: int, milestone_id: int
) -> None:
    workspace, _role = _require_owner(db, actor_id, workspace_id)
    milestone = _get_workspace_milestone(db, workspace.id, milestone_id)
    repository.delete_milestone(db, milestone)
    _commit(db, conflict_detail="Could not delete milestone")


def reorder_milestones(
    db: Session, actor_id: int, workspace_id: int, data: MilestoneReorderRequest
) -> list[dict]:
    workspace, _role = _require_owner(db, actor_id, workspace_id)
    milestones = repository.list_all_milestones_for_workspace(db, workspace.id)
    by_id = {milestone.id: milestone for milestone in milestones}
    requested_ids = [item.id for item in data.items]
    if len(set(requested_ids)) != len(requested_ids):
        raise _bad_request("Duplicate milestone IDs in reorder request")
    if set(requested_ids) != set(by_id):
        raise _bad_request("Reorder request must include all workspace milestones")

    for item in data.items:
        by_id[item.id].position = item.position
    _apply_milestone_positions(milestones)
    for milestone in milestones:
        _sync_milestone(milestone)
    _commit(db, conflict_detail="Could not reorder milestones")
    milestones = repository.list_all_milestones_for_workspace(db, workspace.id)
    return [_serialize_milestone(milestone) for milestone in milestones]


def create_milestone_step(
    db: Session,
    actor_id: int,
    workspace_id: int,
    milestone_id: int,
    data: MilestoneStepCreate,
) -> dict:
    workspace, _role = _require_owner(db, actor_id, workspace_id)
    milestone = _get_workspace_milestone(db, workspace.id, milestone_id)
    position = (
        data.position
        if data.position is not None
        else repository.get_next_step_position(db, milestone.id)
    )
    step = repository.create_step(
        db,
        milestone_id=milestone.id,
        title=data.title,
        description=data.description,
        position=position,
    )
    for task in _validate_task_ids(db, workspace.id, data.task_ids):
        repository.add_step_task(db, step.id, task.id)
    db.flush()

    db.expire(milestone, ["steps"])
    _apply_step_positions(list(milestone.steps))
    _sync_milestone(milestone)
    _commit(db, conflict_detail="Could not create milestone step")
    return _serialize_milestone(_reload(db, milestone))


def update_milestone_step(
    db: Session,
    actor_id: int,
    workspace_id: int,
    milestone_id: int,
    step_id: int,
    data: MilestoneStepUpdate,
) -> dict:
    workspace, _role = _require_owner(db, actor_id, workspace_id)
    milestone, step = _get_milestone_step(db, workspace.id, milestone_id, step_id)
    updates = data.model_dump(exclude_unset=True)
    for field in ("title", "description"):
        if field in updates:
            setattr(step, field, updates[field])
    if "task_ids" in updates:
        tasks = _validate_task_ids(db, workspace.id, updates["task_ids"])
        repository.replace_step_tasks(db, step, [task.id for task in tasks])
    db.expire(milestone, ["steps"])
    _sync_milestone(milestone)
    _commit(db, conflict_detail="Could not update milestone step")
    return _serialize_milestone(_reload(db, milestone))


def delete_milestone_step(
    db: Session,
    actor_id: int,
    workspace_id: int,
    milestone_id: int,
    step_id: int,
) -> dict:
    workspace, _role = _require_owner(db, actor_id, workspace_id)
    milestone, step = _get_milestone_step(db, workspace.id, milestone_id, step_id)
    repository.delete_step(db, step)
    db.flush()
    db.expire(milestone, ["steps"])
    _apply_step_positions(list(milestone.steps))
    _sync_milestone(milestone)
    _commit(db, conflict_detail="Could not delete milestone step")
    return _serialize_milestone(_reload(db, milestone))


def reorder_milestone_steps(
    db: Session,
    actor_id: int,
    workspace_id: int,
    milestone_id: int,
    data: MilestoneStepReorderRequest,
) -> dict:
    workspace, _role = _require_owner(db, actor_id, workspace_id)
    milestone = _get_workspace_milestone(db, workspace.id, milestone_id)
    db.expire(milestone, ["steps"])
    steps = list(milestone.steps)
    by_id = {step.id: step for step in steps}
    requested_ids = [item.id for item in data.items]
    if len(set(requested_ids)) != len(requested_ids):
        raise _bad_request("Duplicate step IDs in reorder request")
    if set(requested_ids) != set(by_id):
        raise _bad_request("Reorder request must include all milestone steps")

    for item in data.items:
        by_id[item.id].position = item.position
    _apply_step_positions(steps)
    _sync_milestone(milestone)
    _commit(db, conflict_detail="Could not reorder milestone steps")
    return _serialize_milestone(_reload(db, milestone))
