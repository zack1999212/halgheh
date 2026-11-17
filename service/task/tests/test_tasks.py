"""Task creation, updates, deletion, authorization, and activity history."""

from __future__ import annotations

import datetime as dt
import json

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from service.task import service as task_service
from service.task.models import Task, TaskActivity
from service.task.schemas import SubtaskCreate, TaskCreate, TaskUpdate


def _count(db, model):
    return db.scalar(select(func.count()).select_from(model))


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------


def test_create_task_defaults(db, make_user):
    owner = make_user("owner")
    task = task_service.create_task(
        db, owner.id, TaskCreate(title="Write the report", priority="high")
    )
    assert task.id is not None
    assert task.created_by == owner.id
    assert task.status == "todo"
    assert task.priority == "high"
    assert task.completed_at is None
    assert task.parent_task_id is None

    entries = db.scalars(select(TaskActivity)).all()
    assert len(entries) == 1
    assert entries[0].action == "task_created"
    assert entries[0].actor_id == owner.id
    assert json.loads(entries[0].new_value)["title"] == "Write the report"


def test_create_task_rejects_blank_title():
    with pytest.raises(ValueError):
        TaskCreate(title="   ")


def test_create_task_rejects_inverted_dates():
    with pytest.raises(ValueError):
        TaskCreate(title="Bad", start_date=dt.date(2026, 5, 10), due_date=dt.date(2026, 5, 1))


def test_create_task_rejects_unknown_priority():
    with pytest.raises(ValueError):
        TaskCreate(title="Bad", priority="critical")


# ---------------------------------------------------------------------------
# Updates + activity
# ---------------------------------------------------------------------------


def test_update_task_records_per_field_activity(db, make_user):
    owner = make_user("owner")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Original"))

    updated = task_service.update_task(
        db, owner.id, task.id, TaskUpdate(title="Renamed", priority="urgent")
    )
    assert updated.title == "Renamed"
    assert updated.priority == "urgent"

    actions = {e.action for e in db.scalars(select(TaskActivity)).all()}
    assert actions == {"task_created", "task_updated", "priority_changed"}
    priority_entry = db.scalars(
        select(TaskActivity).where(TaskActivity.action == "priority_changed")
    ).one()
    assert json.loads(priority_entry.old_value) == "medium"
    assert json.loads(priority_entry.new_value) == "urgent"


def test_update_task_noop_when_values_unchanged(db, make_user):
    owner = make_user("owner")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Same"))
    before = _count(db, TaskActivity)

    task_service.update_task(db, owner.id, task.id, TaskUpdate(title="Same"))
    assert _count(db, TaskActivity) == before


def test_update_task_rejects_inverted_dates_after_merge(db, make_user):
    owner = make_user("owner")
    task = task_service.create_task(
        db, owner.id, TaskCreate(title="Dated", start_date=dt.date(2026, 6, 10))
    )
    with pytest.raises(HTTPException) as err:
        task_service.update_task(
            db, owner.id, task.id, TaskUpdate(due_date=dt.date(2026, 6, 1))
        )
    assert err.value.status_code == 400


def test_update_task_clears_due_date_explicitly(db, make_user):
    owner = make_user("owner")
    task = task_service.create_task(
        db, owner.id, TaskCreate(title="Dated", due_date=dt.date(2026, 6, 10))
    )
    updated = task_service.update_task(db, owner.id, task.id, TaskUpdate(due_date=None))
    assert updated.due_date is None


def test_update_task_rejects_empty_body(db, make_user):
    owner = make_user("owner")
    with pytest.raises(ValueError):
        TaskUpdate()


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------


def test_unrelated_user_cannot_access_or_guess_ids(db, make_user):
    owner = make_user("owner")
    stranger = make_user("stranger")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Secret"))

    with pytest.raises(HTTPException) as err:
        task_service.get_task(db, stranger.id, task.id)
    assert err.value.status_code == 404

    # A guessed (nonexistent) id is indistinguishable from another user's id.
    with pytest.raises(HTTPException) as err:
        task_service.get_task(db, stranger.id, 99999)
    assert err.value.status_code == 404

    with pytest.raises(HTTPException) as err:
        task_service.update_task(db, stranger.id, task.id, TaskUpdate(title="Hijacked"))
    assert err.value.status_code == 404

    with pytest.raises(HTTPException) as err:
        task_service.delete_task(db, stranger.id, task.id)
    assert err.value.status_code == 404


def test_assignee_cannot_restructure_but_owner_can(db, make_user):
    owner = make_user("owner")
    assignee = make_user("helper")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Shared"))
    task_service.assign_user(db, owner.id, task.id, assignee.id)

    with pytest.raises(HTTPException) as err:
        task_service.update_task(db, assignee.id, task.id, TaskUpdate(title="Not mine"))
    assert err.value.status_code == 403

    with pytest.raises(HTTPException) as err:
        task_service.delete_task(db, assignee.id, task.id)
    assert err.value.status_code == 403

    # The owner still has full control.
    updated = task_service.update_task(db, owner.id, task.id, TaskUpdate(description="ok"))
    assert updated.description == "ok"


def test_actor_never_comes_from_payload():
    """The service takes the actor explicitly; no schema accepts actor ids."""
    assert "actor_id" not in TaskCreate.model_fields
    assert "created_by" not in TaskCreate.model_fields
    assert "actor_id" not in TaskUpdate.model_fields
    # SubtaskCreate carries only the *parent*, never the actor.
    assert "actor_id" not in SubtaskCreate.model_fields


# ---------------------------------------------------------------------------
# Deletion: children promoted, activity preserved
# ---------------------------------------------------------------------------


def test_delete_task_promotes_subtasks_and_preserves_activity(db, make_user):
    owner = make_user("owner")
    parent = task_service.create_task(db, owner.id, TaskCreate(title="Parent"))
    child = task_service.create_subtask(
        db, owner.id, parent.id, SubtaskCreate(title="Child", parent_task_id=parent.id)
    )

    task_service.delete_task(db, owner.id, parent.id)

    db.expire_all()
    child_row = db.get(Task, child.id)
    assert child_row is not None
    assert child_row.parent_task_id is None  # promoted, not destroyed

    # The parent's audit trail survived the delete with task_id cleared.
    entries = db.scalars(
        select(TaskActivity).where(TaskActivity.action == "task_deleted")
    ).all()
    assert len(entries) == 1
    assert entries[0].task_id is None
    assert json.loads(entries[0].new_value)["title"] == "Parent"
