"""Focused tests for task checklist API/service behavior.

Runs against the disposable PostgreSQL test database configured in
service/tests/conftest.py. The development database is never touched.
"""

from __future__ import annotations


def create_task(client, user, **overrides):
    payload = {
        "title": overrides.pop("title", "Checklist Task"),
        "description": overrides.pop("description", None),
        "priority": overrides.pop("priority", "medium"),
        "start_date": overrides.pop("start_date", None),
        "due_date": overrides.pop("due_date", None),
    }
    payload.update(overrides)
    res = client.post("/api/tasks", json=payload, headers=user.headers)
    assert res.status_code == 201, res.text
    return res.json()


def checklist_url(task_id, item_id=None, reorder=False):
    base = f"/api/tasks/{task_id}/checklist"
    if reorder:
        return f"{base}/reorder"
    if item_id is not None:
        return f"{base}/{item_id}"
    return base


def create_item(client, user, task_id, title="Item"):
    res = client.post(checklist_url(task_id), json={"title": title}, headers=user.headers)
    assert res.status_code == 201, res.text
    return res.json()


def test_checklist_crud_and_ordering(client, make_user):
    user = make_user()
    task = create_task(client, user, title="CRUD task")

    # Create
    i1 = create_item(client, user, task["id"], "First")
    i2 = create_item(client, user, task["id"], "Second")
    assert i1["title"] == "First"
    assert i1["is_completed"] is False
    assert i1["task_id"] == task["id"]

    # Empty title rejected
    bad = client.post(checklist_url(task["id"]), json={"title": "   "}, headers=user.headers)
    assert bad.status_code in (400, 422), bad.text

    # Too long title rejected
    too_long = client.post(checklist_url(task["id"]), json={"title": "x" * 201}, headers=user.headers)
    assert too_long.status_code in (400, 422), too_long.text

    # List in position order
    listed = client.get(checklist_url(task["id"]), headers=user.headers)
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert body["total"] == 2
    assert [i["id"] for i in body["items"]] == [i1["id"], i2["id"]]

    # Update title
    upd = client.patch(checklist_url(task["id"], i1["id"]), json={"title": "First updated"}, headers=user.headers)
    assert upd.status_code == 200, upd.text
    assert upd.json()["title"] == "First updated"

    # Complete and reopen
    done = client.patch(checklist_url(task["id"], i1["id"]), json={"is_completed": True}, headers=user.headers)
    assert done.status_code == 200
    assert done.json()["is_completed"] is True
    reopened = client.patch(checklist_url(task["id"], i1["id"]), json={"is_completed": False}, headers=user.headers)
    assert reopened.status_code == 200
    assert reopened.json()["is_completed"] is False

    # Delete
    deleted = client.delete(checklist_url(task["id"], i2["id"]), headers=user.headers)
    assert deleted.status_code == 204, deleted.text
    listed2 = client.get(checklist_url(task["id"]), headers=user.headers)
    assert listed2.status_code == 200
    assert [i["id"] for i in listed2.json()["items"]] == [i1["id"]]


def test_checklist_authorization_and_task_membership(client, make_user):
    owner = make_user()
    other = make_user()
    task = create_task(client, owner, title="Owner task")
    item = create_item(client, owner, task["id"], "Secret")

    # Unauthorized modification by unrelated user should be 403 or 404 depending on visibility model
    res = client.post(checklist_url(task["id"]), json={"title": "hack"}, headers=other.headers)
    assert res.status_code in (403, 404), res.text

    res = client.patch(checklist_url(task["id"], item["id"]), json={"title": "hack"}, headers=other.headers)
    assert res.status_code in (403, 404), res.text

    res = client.delete(checklist_url(task["id"], item["id"]), headers=other.headers)
    assert res.status_code in (403, 404), res.text

    # Item belonging to another task
    task2 = create_task(client, owner, title="Other task")
    wrong = client.patch(checklist_url(task2["id"], item["id"]), json={"title": "x"}, headers=owner.headers)
    assert wrong.status_code == 404, wrong.text
    wrong_del = client.delete(checklist_url(task2["id"], item["id"]), headers=owner.headers)
    assert wrong_del.status_code == 404, wrong_del.text


def test_checklist_reorder_validation_and_persistence(client, make_user):
    user = make_user()
    task = create_task(client, user, title="Reorder task")
    i1 = create_item(client, user, task["id"], "A")
    i2 = create_item(client, user, task["id"], "B")
    i3 = create_item(client, user, task["id"], "C")

    # Duplicate IDs rejected
    dup = client.patch(checklist_url(task["id"], reorder=True), json={"item_ids": [i1["id"], i1["id"], i2["id"]]}, headers=user.headers)
    assert dup.status_code in (400, 422), dup.text

    # Foreign/other-task IDs rejected
    task2 = create_task(client, user, title="Other")
    other_item = create_item(client, user, task2["id"], "Foreign")
    foreign = client.patch(checklist_url(task["id"], reorder=True), json={"item_ids": [i1["id"], i2["id"], other_item["id"]]}, headers=user.headers)
    assert foreign.status_code in (400, 422), foreign.text

    # Incomplete reorder payload rejected (API requires exact set)
    incomplete = client.patch(checklist_url(task["id"], reorder=True), json={"item_ids": [i1["id"], i2["id"]]}, headers=user.headers)
    assert incomplete.status_code in (400, 422), incomplete.text

    # Valid reorder persists
    ok = client.patch(checklist_url(task["id"], reorder=True), json={"item_ids": [i3["id"], i1["id"], i2["id"]]}, headers=user.headers)
    assert ok.status_code == 200, ok.text
    assert [i["id"] for i in ok.json()["items"]] == [i3["id"], i1["id"], i2["id"]]

    # Fresh read
    listed = client.get(checklist_url(task["id"]), headers=user.headers)
    assert [i["id"] for i in listed.json()["items"]] == [i3["id"], i1["id"], i2["id"]]


def test_checklist_aggregates_in_task_responses(client, make_user):
    user = make_user()
    task = create_task(client, user, title="Agg task")
    # zero counts
    detail0 = client.get(f"/api/tasks/{task['id']}", headers=user.headers)
    assert detail0.status_code == 200
    assert detail0.json().get("checklist_total") == 0
    assert detail0.json().get("checklist_completed") == 0

    i1 = create_item(client, user, task["id"], "A")
    i2 = create_item(client, user, task["id"], "B")
    client.patch(checklist_url(task["id"], i1["id"]), json={"is_completed": True}, headers=user.headers)

    detail = client.get(f"/api/tasks/{task['id']}", headers=user.headers)
    assert detail.status_code == 200
    d = detail.json()
    assert d["checklist_total"] == 2
    assert d["checklist_completed"] == 1
    # existing fields preserved
    assert "position" in d
    assert "priority_position" in d
    assert d["id"] == task["id"]

    listing = client.get("/api/tasks?limit=100", headers=user.headers)
    assert listing.status_code == 200
    items = listing.json().get("items", [])
    row = next((x for x in items if x["id"] == task["id"]), None)
    assert row is not None
    assert row["checklist_total"] == 2
    assert row["checklist_completed"] == 1
    assert "position" in row
    assert "priority_position" in row
