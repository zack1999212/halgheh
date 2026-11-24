"""Regression tests for task status/priority position ordering.

Runs against the disposable PostgreSQL test database configured in
service/tests/conftest.py. The development database is never touched.
"""

from __future__ import annotations


def create_task(client, user, **overrides):
    payload = {
        "title": overrides.pop("title", "Task"),
        "description": overrides.pop("description", None),
        "priority": overrides.pop("priority", "medium"),
        "start_date": overrides.pop("start_date", None),
        "due_date": overrides.pop("due_date", None),
    }
    payload.update(overrides)
    res = client.post("/api/tasks", json=payload, headers=user.headers)
    assert res.status_code == 201, res.text
    return res.json()


def set_status(client, user, task_id, status):
    res = client.put(f"/api/tasks/{task_id}/status", json={"status": status}, headers=user.headers)
    assert res.status_code == 200, res.text
    return res.json()


def move_position(client, user, task_id, **payload):
    res = client.patch(f"/api/tasks/{task_id}/position", json=payload, headers=user.headers)
    return res


def list_tasks(client, user, **params):
    res = client.get("/api/tasks", params=params, headers=user.headers)
    assert res.status_code == 200, res.text
    return res.json()


def ids_in_order(client, user, **params):
    body = list_tasks(client, user, **params)
    return [item["id"] for item in body["items"]], body


def assert_unique_positions(items, field):
    vals = [item[field] for item in items]
    assert len(vals) == len(set(vals)), (field, vals)


def test_status_insert_after_neighbor_no_collision(client, make_user):
    user = make_user()
    a = create_task(client, user, title="A")
    b = create_task(client, user, title="B")
    c = create_task(client, user, title="C")
    # Initial todo order by position asc
    ids, body = ids_in_order(client, user, status="todo", q="A", sort="position", order="asc", limit=100)
    # use q filter on specific titles not reliable; fetch by ids
    all_items = list_tasks(client, user, status="todo", sort="position", order="asc", limit=100)["items"]
    ours = [i for i in all_items if i["id"] in {a["id"], b["id"], c["id"]}]
    assert [i["id"] for i in ours] == [a["id"], b["id"], c["id"]]

    # Reproduce reported bug: move C immediately after A (before_id=A means after A)
    res = move_position(client, user, c["id"], target_status="todo", before_task_id=a["id"])
    assert res.status_code == 200, res.text

    all_items = list_tasks(client, user, status="todo", sort="position", order="asc", limit=100)["items"]
    ours = [i for i in all_items if i["id"] in {a["id"], b["id"], c["id"]}]
    assert [i["id"] for i in ours] == [a["id"], c["id"], b["id"]]
    assert_unique_positions(ours, "position")

    # Persistence/fresh read
    fresh = client.get(f"/api/tasks/{c['id']}", headers=user.headers).json()
    assert fresh["status"] == "todo"
    positions = {i["id"]: i["position"] for i in ours}
    assert positions[a["id"]] < positions[c["id"]] < positions[b["id"]]


def test_status_insert_before_neighbor(client, make_user):
    user = make_user()
    a = create_task(client, user, title="A")
    b = create_task(client, user, title="B")
    c = create_task(client, user, title="C")
    # Move A before C (after_task_id=C means before C)
    res = move_position(client, user, a["id"], target_status="todo", after_task_id=c["id"])
    assert res.status_code == 200, res.text
    items = [i for i in list_tasks(client, user, status="todo", sort="position", order="asc", limit=100)["items"] if i["id"] in {a["id"], b["id"], c["id"]}]
    assert [i["id"] for i in items] == [b["id"], a["id"], c["id"]]
    assert_unique_positions(items, "position")


def test_status_insert_between_two_tasks(client, make_user):
    user = make_user()
    a = create_task(client, user, title="A")
    b = create_task(client, user, title="B")
    c = create_task(client, user, title="C")
    res = move_position(client, user, c["id"], target_status="todo", before_task_id=a["id"], after_task_id=b["id"])
    assert res.status_code == 200, res.text
    items = [i for i in list_tasks(client, user, status="todo", sort="position", order="asc", limit=100)["items"] if i["id"] in {a["id"], b["id"], c["id"]}]
    assert [i["id"] for i in items] == [a["id"], c["id"], b["id"]]
    assert_unique_positions(items, "position")


def test_status_move_beginning_and_end(client, make_user):
    user = make_user()
    a = create_task(client, user, title="A")
    b = create_task(client, user, title="B")
    c = create_task(client, user, title="C")
    # move C to beginning
    res = move_position(client, user, c["id"], target_status="todo", after_task_id=a["id"])
    assert res.status_code == 200, res.text
    items = [i for i in list_tasks(client, user, status="todo", sort="position", order="asc", limit=100)["items"] if i["id"] in {a["id"], b["id"], c["id"]}]
    assert [i["id"] for i in items] == [c["id"], a["id"], b["id"]]
    # move C to end
    res = move_position(client, user, c["id"], target_status="todo", before_task_id=b["id"])
    assert res.status_code == 200, res.text
    items = [i for i in list_tasks(client, user, status="todo", sort="position", order="asc", limit=100)["items"] if i["id"] in {a["id"], b["id"], c["id"]}]
    assert [i["id"] for i in items] == [a["id"], b["id"], c["id"]]
    assert_unique_positions(items, "position")


def test_status_cross_status_and_unrelated_group(client, make_user):
    user = make_user()
    a = create_task(client, user, title="A")
    b = create_task(client, user, title="B")
    x = create_task(client, user, title="X")
    set_status(client, user, x["id"], "in_progress")
    before = [i for i in list_tasks(client, user, status="in_progress", sort="position", order="asc", limit=100)["items"] if i["id"] == x["id"]]
    res = move_position(client, user, b["id"], target_status="in_progress")
    assert res.status_code == 200, res.text
    inprog = [i for i in list_tasks(client, user, status="in_progress", sort="position", order="asc", limit=100)["items"] if i["id"] in {b["id"], x["id"]}]
    assert [i["id"] for i in inprog] == [x["id"], b["id"]]
    # unrelated todo group still has A
    todo = [i for i in list_tasks(client, user, status="todo", sort="position", order="asc", limit=100)["items"] if i["id"] == a["id"]]
    assert [i["id"] for i in todo] == [a["id"]]


def test_priority_ordering_collisions_and_moves(client, make_user):
    user = make_user()
    a = create_task(client, user, title="A", priority="medium")
    b = create_task(client, user, title="B", priority="medium")
    c = create_task(client, user, title="C", priority="medium")

    # insert C after A in same priority
    res = move_position(client, user, c["id"], target_priority="medium", before_task_id=a["id"])
    assert res.status_code == 200, res.text
    items = [i for i in list_tasks(client, user, priority="medium", sort="priority_position", order="asc", limit=100)["items"] if i["id"] in {a["id"], b["id"], c["id"]}]
    assert [i["id"] for i in items] == [a["id"], c["id"], b["id"]]
    assert_unique_positions(items, "priority_position")

    # insert A before C (after_task_id=C)
    res = move_position(client, user, a["id"], target_priority="medium", after_task_id=c["id"])
    assert res.status_code == 200, res.text
    items = [i for i in list_tasks(client, user, priority="medium", sort="priority_position", order="asc", limit=100)["items"] if i["id"] in {a["id"], b["id"], c["id"]}]
    assert [i["id"] for i in items] == [a["id"], c["id"], b["id"]]
    assert_unique_positions(items, "priority_position")

    # move between priorities
    res = move_position(client, user, b["id"], target_priority="high")
    assert res.status_code == 200, res.text
    bfresh = client.get(f"/api/tasks/{b['id']}", headers=user.headers).json()
    assert bfresh["priority"] == "high"

    # beginning/end in priority group
    d = create_task(client, user, title="D", priority="high")
    res = move_position(client, user, d["id"], target_priority="high", after_task_id=b["id"])
    assert res.status_code == 200, res.text
    high = [i for i in list_tasks(client, user, priority="high", sort="priority_position", order="asc", limit=100)["items"] if i["id"] in {b["id"], d["id"]}]
    assert [i["id"] for i in high] == [d["id"], b["id"]]
    assert_unique_positions(high, "priority_position")


def test_position_invalid_refs_and_noop(client, make_user):
    user = make_user()
    a = create_task(client, user, title="A")
    b = create_task(client, user, title="B")
    # unknown neighbor
    res = move_position(client, user, a["id"], target_status="todo", before_task_id=99999999)
    assert res.status_code == 400, res.text
    # self reference
    res = move_position(client, user, a["id"], target_status="todo", before_task_id=a["id"])
    assert res.status_code == 400, res.text
    # no-op same column/position should not error
    before = client.get(f"/api/tasks/{a['id']}", headers=user.headers).json()["position"]
    res = move_position(client, user, a["id"], target_status="todo")
    assert res.status_code == 200, res.text
    after = client.get(f"/api/tasks/{a['id']}", headers=user.headers).json()["position"]
    assert isinstance(before, int) and isinstance(after, int)
