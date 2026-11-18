"""Assignment lifecycle: assign, duplicates, reassignment, removal, listings."""

from __future__ import annotations

import json

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from service.task import service as task_service
from service.task.models import TaskAssignment
from service.task.schemas import TaskCreate, TaskFilter

from service.task.repository import list_assignments


def _active(db, task_id):
    return list_assignments(db, task_id, status="active")


def test_assign_user_creates_active_assignment(db, make_user):
    owner = make_user("owner")
    helper = make_user("helper")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Delegate"))
    task_service.assign_user(db, owner.id, task.id, helper.id)

    active = _active(db, task.id)
    assert len(active) == 1
    assert active[0].assigned_user_id == helper.id
    assert active[0].assigned_by == owner.id
    assert active[0].assignment_status == "active"


def test_duplicate_assignment_is_idempotent(db, make_user):
    owner = make_user("owner")
    helper = make_user("helper")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Delegate"))
    task_service.assign_user(db, owner.id, task.id, helper.id)
    task_service.assign_user(db, owner.id, task.id, helper.id)

    rows = db.scalars(
        select(func.count()).select_from(TaskAssignment)
    ).one()
    assert rows == 1  # unique (task_id, assigned_user_id) + idempotent service


def test_cancel_then_reassign_reactivates_same_row(db, make_user):
    owner = make_user("owner")
    helper = make_user("helper")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Delegate"))
    task_service.assign_user(db, owner.id, task.id, helper.id)
    first_row_id = _active(db, task.id)[0].id

    task_service.remove_assignment(db, owner.id, task.id, helper.id)
    assert _active(db, task.id) == []  # cancelled row kept, not deleted

    task_service.assign_user(db, owner.id, task.id, helper.id)
    active = _active(db, task.id)
    assert len(active) == 1
    assert active[0].id == first_row_id  # reactivated in place, history kept
    assert active[0].assignment_status == "active"


def test_reassign_replaces_active_assignees(db, make_user):
    owner = make_user("owner")
    alice = make_user("alice")
    bob = make_user("bob")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Handover"))
    task_service.assign_user(db, owner.id, task.id, alice.id)

    task_service.reassign_task(db, owner.id, task.id, bob.id)

    active = {a.assigned_user_id for a in _active(db, task.id)}
    assert active == {bob.id}

    rows = db.scalars(select(TaskAssignment)).all()
    assert len(rows) == 2  # two rows total: alice (cancelled) + bob (active)
    removed = db.scalars(
        select(TaskAssignment).where(TaskAssignment.assigned_user_id == alice.id)
    ).one()
    assert removed.assignment_status == "cancelled"

    # Audit trail recorded the handover.
    from service.task.models import TaskActivity

    acts = {e.action for e in db.scalars(select(TaskActivity)).all()}
    assert {"assignee_added", "assignee_removed"} <= acts


def test_reassign_to_existing_active_assignee_is_noop(db, make_user):
    owner = make_user("owner")
    alice = make_user("alice")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Same"))
    task_service.assign_user(db, owner.id, task.id, alice.id)

    task_service.reassign_task(db, owner.id, task.id, alice.id)
    active = _active(db, task.id)
    assert len(active) == 1
    assert active[0].assignment_status == "active"


def test_assign_to_unknown_user_rejected(db, make_user):
    owner = make_user("owner")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Task"))
    with pytest.raises(HTTPException) as err:
        task_service.assign_user(db, owner.id, task.id, 424242)
    assert err.value.status_code == 400


def test_unauthorized_assignment_attempts(db, make_user):
    owner = make_user("owner")
    helper = make_user("helper")
    outsider = make_user("outsider")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Task"))

    # Outsider cannot even see the task -> 404, indistinguishable from a
    # wrong id (no information leak).
    with pytest.raises(HTTPException) as err:
        task_service.assign_user(db, outsider.id, task.id, helper.id)
    assert err.value.status_code == 404

    # An assignee can see the task but may not manage assignments -> 403.
    task_service.assign_user(db, owner.id, task.id, helper.id)
    with pytest.raises(HTTPException) as err:
        task_service.assign_user(db, helper.id, task.id, outsider.id)
    assert err.value.status_code == 403


def test_remove_assignment_requires_owner_and_keeps_history(db, make_user):
    owner = make_user("owner")
    helper = make_user("helper")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Task"))
    task_service.assign_user(db, owner.id, task.id, helper.id)

    with pytest.raises(HTTPException) as err:
        task_service.remove_assignment(db, helper.id, task.id, helper.id)
    assert err.value.status_code == 403

    task_service.remove_assignment(db, owner.id, task.id, helper.id)
    cancelled = db.scalars(
        select(TaskAssignment).where(TaskAssignment.task_id == task.id)
    ).all()
    assert len(cancelled) == 1
    assert cancelled[0].assignment_status == "cancelled"

    # Idempotent: removing again changes nothing.
    task_service.remove_assignment(db, owner.id, task.id, helper.id)
    assert (
        db.scalar(select(func.count()).select_from(TaskAssignment)) == 1
    )


def test_listing_scopes_created_assigned_assigned_by(db, make_user):
    owner = make_user("owner")
    helper = make_user("helper")
    task_a = task_service.create_task(db, owner.id, TaskCreate(title="Delegated"))
    task_b = task_service.create_task(db, owner.id, TaskCreate(title="Kept"))
    task_service.assign_user(db, owner.id, task_a.id, helper.id)
    task_service.assign_user(db, owner.id, task_b.id, helper.id)
    task_service.remove_assignment(db, owner.id, task_b.id, helper.id)

    flt = TaskFilter()
    created, total_c = task_service.list_tasks(db, owner.id, flt, scope="created")
    assert total_c == 2

    assigned_to_helper, total_a = task_service.list_tasks(
        db, helper.id, flt, scope="assigned"
    )
    assert total_a == 1  # only the active assignment
    assert assigned_to_helper[0].id == task_a.id

    delegated, total_d = task_service.list_tasks(db, owner.id, flt, scope="assigned_by")
    assert total_d == 1
    assert delegated[0].id == task_a.id

    # The helper sees exactly one task in the default visible scope.
    visible, total_v = task_service.list_tasks(db, helper.id, flt, scope="visible")
    assert total_v == 1
    assert visible[0].id == task_a.id

    # Empty results, never other users' data.
    stranger_view, total_s = task_service.list_tasks(
        db, make_user("stranger").id, flt, scope="assigned"
    )
    assert total_s == 0 and stranger_view == []


def test_assignment_activity_payloads(db, make_user):
    owner = make_user("owner")
    helper = make_user("helper")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Task"))
    task_service.assign_user(db, owner.id, task.id, helper.id)

    from service.task.models import TaskActivity

    entry = db.scalars(
        select(TaskActivity).where(TaskActivity.action == "assignee_added")
    ).one()
    assert json.loads(entry.new_value)["user_id"] == helper.id
    assert entry.actor_id == owner.id
