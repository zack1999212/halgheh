"""Status transition validation and completion tracking."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from service.task import service as task_service
from service.task.models import TaskActivity
from service.task.schemas import TaskCreate, TaskStatusUpdate
from sqlalchemy import select


def _get_task(db, task_id):
    from service.task.repository import get_task

    return get_task(db, task_id)


def test_full_forward_path_sets_completed_at(db, make_user):
    owner = make_user("owner")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Flow"))

    task = task_service.set_task_status(db, owner.id, task.id, "in_progress")
    assert task.completed_at is None

    task = task_service.set_task_status(db, owner.id, task.id, "done")
    assert task.completed_at is not None

    row = _get_task(db, task.id)
    assert row.status == "done" and row.completed_at is not None


def test_reopen_clears_completed_at(db, make_user):
    owner = make_user("owner")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Reopen"))
    task_service.set_task_status(db, owner.id, task.id, "done")
    reopened = task_service.set_task_status(db, owner.id, task.id, "todo")
    assert reopened.completed_at is None
    assert reopened.status == "todo"


def test_invalid_transition_rejected(db, make_user):
    owner = make_user("owner")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Rules"))
    # todo -> in_progress -> done -> blocked is not allowed.
    task_service.set_task_status(db, owner.id, task.id, "in_progress")
    task_service.set_task_status(db, owner.id, task.id, "done")
    with pytest.raises(HTTPException) as err:
        task_service.set_task_status(db, owner.id, task.id, "blocked")
    assert err.value.status_code == 400
    assert "Invalid status transition" in err.value.detail

    # cancelled -> done is also invalid.
    task_service.set_task_status(db, owner.id, task.id, "todo")
    task_service.set_task_status(db, owner.id, task.id, "cancelled")
    with pytest.raises(HTTPException) as err:
        task_service.set_task_status(db, owner.id, task.id, "done")
    assert err.value.status_code == 400


def test_same_status_is_idempotent(db, make_user):
    owner = make_user("owner")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Idempotent"))
    again = task_service.set_task_status(db, owner.id, task.id, "todo")
    assert again.status == "todo"
    assert again.completed_at is None


def test_status_activity_recorded(db, make_user):
    owner = make_user("owner")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Audited"))
    task_service.set_task_status(db, owner.id, task.id, "done")

    entry = db.scalars(
        select(TaskActivity).where(TaskActivity.action == "status_changed")
    ).one()
    assert entry.old_value == "todo"
    assert entry.new_value == "done"
    assert entry.actor_id == owner.id


def test_assignee_can_change_status_but_not_via_patch(db, make_user):
    owner = make_user("owner")
    helper = make_user("helper")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Assigned"))
    task_service.assign_user(db, owner.id, task.id, helper.id)

    moved = task_service.set_task_status(db, helper.id, task.id, "in_progress")
    assert moved.status == "in_progress"


def test_unrelated_user_cannot_change_status(db, make_user):
    owner = make_user("owner")
    stranger = make_user("stranger")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Task"))
    with pytest.raises(HTTPException) as err:
        task_service.set_task_status(db, stranger.id, task.id, "done")
    assert err.value.status_code == 404


def test_status_schema_validates_values(db, make_user):
    with pytest.raises(ValueError):
        TaskStatusUpdate(status="finished")
    TaskStatusUpdate(status="in_progress")  # valid
