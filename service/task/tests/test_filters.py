"""Filtering, searching, sorting and pagination."""

from __future__ import annotations

import datetime as dt

import pytest
from pydantic import ValidationError

from service.task import service as task_service
from service.task.schemas import SubtaskCreate, TaskCreate, TaskFilter, TaskLabelCreate

from service.task.repository import list_visible


def _seed(db, owner_id):
    today = dt.date.today()
    t_overdue = task_service.create_task(
        db, owner_id, TaskCreate(title="Overdue report", priority="urgent", due_date=today - dt.timedelta(days=3))
    )
    t_today = task_service.create_task(
        db, owner_id, TaskCreate(title="Call the vendor", priority="medium", due_date=today)
    )
    t_upcoming = task_service.create_task(
        db, owner_id, TaskCreate(title="Plan the offsite", description="agenda and venue", priority="low", due_date=today + dt.timedelta(days=7))
    )
    t_done = task_service.create_task(
        db, owner_id, TaskCreate(title="Archive last quarter", due_date=today - dt.timedelta(days=10))
    )
    task_service.set_task_status(db, owner_id, t_done.id, "done")
    return t_overdue, t_today, t_upcoming, t_done


def test_filter_by_status(db, make_user):
    owner = make_user("owner")
    _seed(db, owner.id)
    items, total = task_service.list_tasks(db, owner.id, TaskFilter(status=["done"]))
    assert total == 1 and items[0].title == "Archive last quarter"


def test_filter_by_priority(db, make_user):
    owner = make_user("owner")
    _seed(db, owner.id)
    items, total = task_service.list_tasks(db, owner.id, TaskFilter(priority=["urgent"]))
    assert total == 1 and items[0].title == "Overdue report"


def test_search_matches_title_and_description(db, make_user):
    owner = make_user("owner")
    _seed(db, owner.id)
    items, total = task_service.list_tasks(db, owner.id, TaskFilter(q="vendor"))
    assert total == 1 and items[0].title == "Call the vendor"
    items, total = task_service.list_tasks(db, owner.id, TaskFilter(q="venue"))
    assert total == 1 and items[0].title == "Plan the offsite"


def test_due_filters(db, make_user):
    owner = make_user("owner")
    _seed(db, owner.id)
    overdue, total_o = task_service.list_tasks(db, owner.id, TaskFilter(due="overdue"))
    assert total_o == 1 and overdue[0].title == "Overdue report"
    _, total_t = task_service.list_tasks(db, owner.id, TaskFilter(due="today"))
    assert total_t == 1
    _, total_u = task_service.list_tasks(db, owner.id, TaskFilter(due="upcoming"))
    assert total_u == 2  # today counts as upcoming (due >= today)


def test_pagination_totals_and_slices(db, make_user):
    owner = make_user("owner")
    for i in range(5):
        task_service.create_task(db, owner.id, TaskCreate(title=f"Task {i}"))

    page, total = task_service.list_tasks(db, owner.id, TaskFilter(limit=2, offset=0))
    assert total == 5 and len(page) == 2
    page2, _ = task_service.list_tasks(db, owner.id, TaskFilter(limit=2, offset=2))
    assert len(page2) == 2 and page2[0].id != page[0].id
    page3, _ = task_service.list_tasks(db, owner.id, TaskFilter(limit=2, offset=4))
    assert len(page3) == 1


def test_default_ordering_open_first_then_deadline(db, make_user):
    owner = make_user("owner")
    today = dt.date.today()
    later = task_service.create_task(db, owner.id, TaskCreate(title="Later", due_date=today + dt.timedelta(days=5)))
    done = task_service.create_task(db, owner.id, TaskCreate(title="Finished"))
    task_service.set_task_status(db, owner.id, done.id, "done")
    sooner = task_service.create_task(db, owner.id, TaskCreate(title="Sooner", due_date=today + dt.timedelta(days=1)))
    no_due = task_service.create_task(db, owner.id, TaskCreate(title="No due date"))

    items, _ = task_service.list_tasks(db, owner.id, TaskFilter())
    ids = [t.id for t in items]
    # Open tasks first, by due date asc (missing dates last); done last.
    assert ids.index(sooner.id) < ids.index(later.id) < ids.index(no_due.id)
    assert ids[-1] == done.id


def test_sort_by_priority_uses_weight(db, make_user):
    owner = make_user("owner")
    low = task_service.create_task(db, owner.id, TaskCreate(title="L", priority="low"))
    urgent = task_service.create_task(db, owner.id, TaskCreate(title="U", priority="urgent"))
    high = task_service.create_task(db, owner.id, TaskCreate(title="H", priority="high"))

    items, _ = task_service.list_tasks(db, owner.id, TaskFilter(sort="priority"))
    ids = [t.id for t in items]
    assert ids.index(urgent.id) < ids.index(high.id) < ids.index(low.id)

    items, _ = task_service.list_tasks(
        db, owner.id, TaskFilter(sort="priority", order="desc")
    )
    ids = [t.id for t in items]
    assert ids.index(low.id) < ids.index(high.id) < ids.index(urgent.id)


def test_assignee_and_creator_filters(db, make_user):
    owner = make_user("owner")
    helper = make_user("helper")
    assigned = task_service.create_task(db, owner.id, TaskCreate(title="Assigned"))
    unassigned = task_service.create_task(db, owner.id, TaskCreate(title="Unassigned"))
    task_service.assign_user(db, owner.id, assigned.id, helper.id)

    items, total = task_service.list_tasks(
        db, owner.id, TaskFilter(assigned_user_id=helper.id)
    )
    assert total == 1 and items[0].id == assigned.id

    items, total = task_service.list_tasks(
        db, owner.id, TaskFilter(created_by=owner.id)
    )
    assert total == 2

    # Filtering by another creator yields nothing (visibility clause wins).
    stranger = make_user("stranger")
    items, total = task_service.list_tasks(
        db, owner.id, TaskFilter(created_by=stranger.id)
    )
    assert total == 0 and items == []


def test_parent_and_label_filters(db, make_user):
    owner = make_user("owner")
    parent = task_service.create_task(db, owner.id, TaskCreate(title="Epic"))
    child = task_service.create_subtask(
        db, owner.id, parent.id, SubtaskCreate(title="Story", parent_task_id=parent.id)
    )
    label = task_service.create_label(db, owner.id, TaskLabelCreate(name="ops"))
    task_service.attach_label(db, owner.id, parent.id, label.id)

    items, total = task_service.list_tasks(
        db, owner.id, TaskFilter(parent_task_id=parent.id)
    )
    assert total == 1 and items[0].id == child.id

    items, total = task_service.list_tasks(db, owner.id, TaskFilter(label_id=label.id))
    assert total == 1 and items[0].id == parent.id

    # Direct repository call also respects filters.
    items, total = list_visible(db, owner.id, TaskFilter(label_id=label.id))
    assert total == 1


def test_filter_validation_rejects_unknown_values():
    with pytest.raises(ValidationError):
        TaskFilter(status=["deleted"])
    with pytest.raises(ValidationError):
        TaskFilter(sort="title")
    with pytest.raises(ValidationError):
        TaskFilter(limit=500)
