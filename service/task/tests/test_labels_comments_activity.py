"""Labels, comments, and activity-history integrity."""

from __future__ import annotations

import json

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from service.task import service as task_service
from service.task.models import Task, TaskActivity, TaskLabel, TaskLabelAssignment
from service.task.schemas import TaskCreate, TaskLabelCreate, TaskLabelUpdate


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------


def test_label_crud_and_scoping(db, make_user):
    owner = make_user("owner")
    label = task_service.create_label(
        db, owner.id, TaskLabelCreate(name="ops", color="#3366ff")
    )
    assert label.created_by == owner.id and label.color == "#3366ff"

    updated = task_service.update_label(
        db, owner.id, label.id, TaskLabelUpdate(name="operations")
    )
    assert updated.name == "operations"

    items, total = task_service.list_labels(db, owner.id)
    assert total == 1

    task_service.delete_label(db, owner.id, label.id)
    assert db.get(TaskLabel, label.id) is None
    # Cascade removed any links; tasks survive.
    assert db.scalar(select(func.count()).select_from(TaskLabelAssignment)) == 0


def test_duplicate_label_name_rejected(db, make_user):
    owner = make_user("owner")
    task_service.create_label(db, owner.id, TaskLabelCreate(name="ops"))
    with pytest.raises(HTTPException) as err:
        task_service.create_label(db, owner.id, TaskLabelCreate(name="ops"))
    assert err.value.status_code == 400
    assert "already exists" in err.value.detail


def test_same_label_name_allowed_across_users(db, make_user):
    alice = make_user("alice")
    bob = make_user("bob")
    task_service.create_label(db, alice.id, TaskLabelCreate(name="ops"))
    task_service.create_label(db, bob.id, TaskLabelCreate(name="ops"))


def test_label_color_validation(db, make_user):
    with pytest.raises(ValueError):
        TaskLabelCreate(name="bad", color="blue")
    with pytest.raises(ValueError):
        TaskLabelCreate(name="bad", color="#12345")


def test_attach_detach_label_idempotent_and_scoped(db, make_user):
    owner = make_user("owner")
    helper = make_user("helper")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Task"))
    label = task_service.create_label(db, owner.id, TaskLabelCreate(name="ops"))

    task_service.attach_label(db, owner.id, task.id, label.id)
    task_service.attach_label(db, owner.id, task.id, label.id)  # idempotent
    assert (
        db.scalar(
            select(func.count()).select_from(TaskLabelAssignment).where(
                TaskLabelAssignment.task_id == task.id
            )
        )
        == 1
    )

    # A user cannot attach labels they do not own.
    foreign = task_service.create_label(db, helper.id, TaskLabelCreate(name="mine"))
    with pytest.raises(HTTPException) as err:
        task_service.attach_label(db, owner.id, task.id, foreign.id)
    assert err.value.status_code == 404

    task_service.detach_label(db, owner.id, task.id, label.id)
    assert (
        db.scalar(
            select(func.count())
            .select_from(TaskLabelAssignment)
            .where(TaskLabelAssignment.task_id == task.id)
        )
        == 0
    )

    # Detaching again is a no-op.
    task_service.detach_label(db, owner.id, task.id, label.id)


def test_attach_label_requires_owner(db, make_user):
    owner = make_user("owner")
    helper = make_user("helper")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Task"))
    task_service.assign_user(db, owner.id, task.id, helper.id)
    label = task_service.create_label(db, helper.id, TaskLabelCreate(name="mine"))

    with pytest.raises(HTTPException) as err:
        task_service.attach_label(db, helper.id, task.id, label.id)
    assert err.value.status_code == 403


def test_label_deletion_records_per_task_activity(db, make_user):
    owner = make_user("owner")
    label = task_service.create_label(db, owner.id, TaskLabelCreate(name="ops"))
    t1 = task_service.create_task(db, owner.id, TaskCreate(title="One"))
    t2 = task_service.create_task(db, owner.id, TaskCreate(title="Two"))
    task_service.attach_label(db, owner.id, t1.id, label.id)
    task_service.attach_label(db, owner.id, t2.id, label.id)

    task_service.delete_label(db, owner.id, label.id)

    removals = db.scalars(
        select(TaskActivity).where(TaskActivity.action == "label_removed")
    ).all()
    assert len(removals) == 2
    assert json.loads(removals[0].old_value)["label_name"] == "ops"


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------


def test_comment_lifecycle(db, make_user):
    owner = make_user("owner")
    helper = make_user("helper")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Task"))
    task_service.assign_user(db, owner.id, task.id, helper.id)

    c1 = task_service.add_comment(db, owner.id, task.id, "First")
    c2 = task_service.add_comment(db, helper.id, task.id, "Second")
    items, total = task_service.list_comments(db, owner.id, task.id)
    assert total == 2
    assert [c.id for c in items] == [c1.id, c2.id]

    # Only the author may delete a comment (owner is not exempt).
    with pytest.raises(HTTPException) as err:
        task_service.delete_comment(db, owner.id, task.id, c2.id)
    assert err.value.status_code == 403

    task_service.delete_comment(db, helper.id, task.id, c2.id)
    items, total = task_service.list_comments(db, helper.id, task.id)
    assert total == 1

    actions = {e.action for e in db.scalars(select(TaskActivity)).all()}
    assert {"comment_added", "comment_deleted"} <= actions


def test_comment_requires_visibility(db, make_user):
    owner = make_user("owner")
    stranger = make_user("stranger")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Task"))

    with pytest.raises(HTTPException) as err:
        task_service.add_comment(db, stranger.id, task.id, "sneaky")
    assert err.value.status_code == 404


def test_comment_validation(db, make_user):
    owner = make_user("owner")
    with pytest.raises(ValueError):
        from service.task.schemas import TaskCommentCreate

        TaskCommentCreate(content="   ")


# ---------------------------------------------------------------------------
# Activity history
# ---------------------------------------------------------------------------


def test_activity_listing_newest_first_and_scoped(db, make_user):
    owner = make_user("owner")
    helper = make_user("helper")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Task"))
    task_service.assign_user(db, owner.id, task.id, helper.id)
    task_service.add_comment(db, helper.id, task.id, "hi")

    entries, total = task_service.list_activity(db, owner.id, task.id)
    assert total == len(entries) and total >= 3
    created = [e.created_at for e in entries]
    assert created == sorted(created, reverse=True)

    # An unrelated user cannot read the history of a task they cannot see.
    stranger = make_user("stranger")
    with pytest.raises(HTTPException) as err:
        task_service.list_activity(db, stranger.id, task.id)
    assert err.value.status_code == 404


def test_activity_is_not_cascaded_away(db, make_user):
    owner = make_user("owner")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Doomed"))
    task_service.set_task_status(db, owner.id, task.id, "done")
    before = db.scalar(select(func.count()).select_from(TaskActivity))

    task_service.delete_task(db, owner.id, task.id)

    after_rows = db.scalars(select(TaskActivity)).all()
    # History preserved AND a final 'task_deleted' audit entry appended with
    # an embedded snapshot — so exactly one more row than before, all with a
    # cleared task_id (FK ON DELETE SET NULL).
    assert len(after_rows) == before + 1
    for entry in after_rows:
        assert entry.task_id is None
        assert entry.actor_id == owner.id
    deleted = [e for e in after_rows if e.action == "task_deleted"]
    assert len(deleted) == 1
    assert json.loads(deleted[0].new_value)["title"] == "Doomed"
