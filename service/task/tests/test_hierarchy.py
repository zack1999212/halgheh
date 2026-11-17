"""Subtask hierarchy: creation, access, and circular-relationship prevention."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from service.task import service as task_service
from service.task.schemas import SubtaskCreate, TaskCreate, TaskFilter, TaskUpdate


def test_subtask_creation_links_and_scopes(db, make_user):
    owner = make_user("owner")
    parent = task_service.create_task(db, owner.id, TaskCreate(title="Epic"))
    child = task_service.create_subtask(
        db, owner.id, parent.id, SubtaskCreate(title="Story", parent_task_id=parent.id)
    )
    assert child.parent_task_id == parent.id
    assert child.created_by == owner.id
    assert child.status == "todo"

    children, total = task_service.list_subtasks(
        db, owner.id, parent.id, TaskFilter()
    )
    assert total == 1
    assert children[0].id == child.id

    parent_row = task_service.get_parent_task(db, owner.id, child.id)
    assert parent_row is not None and parent_row.id == parent.id


def test_subtask_requires_accessible_parent(db, make_user):
    owner = make_user("owner")
    stranger = make_user("stranger")
    parent = task_service.create_task(db, owner.id, TaskCreate(title="Private epic"))

    # A stranger cannot attach subtasks to a task they cannot see.
    with pytest.raises(HTTPException) as err:
        task_service.create_subtask(
            db,
            stranger.id,
            parent.id,
            SubtaskCreate(title="Infiltration", parent_task_id=parent.id),
        )
    assert err.value.status_code == 404

    with pytest.raises(HTTPException) as err:
        task_service.create_subtask(
            db, owner.id, 99999, SubtaskCreate(title="Ghost", parent_task_id=99999)
        )
    assert err.value.status_code == 404


def test_direct_cycle_rejected(db, make_user):
    owner = make_user("owner")
    parent = task_service.create_task(db, owner.id, TaskCreate(title="Parent"))
    child = task_service.create_subtask(
        db, owner.id, parent.id, SubtaskCreate(title="Child", parent_task_id=parent.id)
    )

    with pytest.raises(HTTPException) as err:
        task_service.set_parent_task(db, owner.id, parent.id, child.id)
    assert err.value.status_code == 400
    assert "ircular" in err.value.detail


def test_self_parent_rejected(db, make_user):
    owner = make_user("owner")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Loop"))
    with pytest.raises(HTTPException) as err:
        task_service.set_parent_task(db, owner.id, task.id, task.id)
    assert err.value.status_code == 400


def test_deep_cycle_rejected(db, make_user):
    """A -> B -> C chain; making C's ancestor A the parent of A must fail."""
    owner = make_user("owner")
    a = task_service.create_task(db, owner.id, TaskCreate(title="A"))
    b = task_service.create_subtask(
        db, owner.id, a.id, SubtaskCreate(title="B", parent_task_id=a.id)
    )
    c = task_service.create_subtask(
        db, owner.id, b.id, SubtaskCreate(title="C", parent_task_id=b.id)
    )

    with pytest.raises(HTTPException) as err:
        task_service.set_parent_task(db, owner.id, a.id, c.id)
    assert err.value.status_code == 400


def test_reparenting_to_unrelated_task_allowed(db, make_user):
    owner = make_user("owner")
    root = task_service.create_task(db, owner.id, TaskCreate(title="Root"))
    child = task_service.create_subtask(
        db, owner.id, root.id, SubtaskCreate(title="Child", parent_task_id=root.id)
    )
    other = task_service.create_task(db, owner.id, TaskCreate(title="Other root"))

    moved = task_service.set_parent_task(db, owner.id, child.id, other.id)
    assert moved.parent_task_id == other.id

    detached = task_service.set_parent_task(db, owner.id, child.id, None)
    assert detached.parent_task_id is None


def test_reparenting_requires_owner(db, make_user):
    owner = make_user("owner")
    assignee = make_user("helper")
    root = task_service.create_task(db, owner.id, TaskCreate(title="Root"))
    child = task_service.create_subtask(
        db, owner.id, root.id, SubtaskCreate(title="Child", parent_task_id=root.id)
    )
    other = task_service.create_task(db, owner.id, TaskCreate(title="Other"))
    task_service.assign_user(db, owner.id, child.id, assignee.id)

    with pytest.raises(HTTPException) as err:
        task_service.set_parent_task(db, assignee.id, child.id, other.id)
    assert err.value.status_code == 403


def test_task_update_rejects_parent_field(db, make_user):
    """Hierarchy changes go through the dedicated operation, never PATCH."""
    owner = make_user("owner")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Task"))
    assert "parent_task_id" not in TaskUpdate.model_fields
    assert task.parent_task_id is None
