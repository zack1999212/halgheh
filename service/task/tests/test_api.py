"""API-level tests for the task router.

Uses FastAPI's TestClient with the real router mounted, the real
``get_db``/``get_current_user`` dependency keys overridden per test:

* ``get_db``   -> the shared in-memory session from conftest.py
* ``get_current_user`` -> a switchable "current user" holder, so tests can
  act as different users (and see the real 401 when nobody is set).

Requires ``httpx`` (TestClient's transport) and ``pytest`` inside the
backend container; both are dev/test dependencies and are deliberately NOT
added to requirements.txt without approval:

    docker compose run --rm backend python -m pytest service/task/tests -v
"""

from __future__ import annotations

import pytest

httpx = pytest.importorskip("httpx", reason="TestClient needs httpx (dev dependency)")

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from service.auth.dependencies import get_current_user  # noqa: E402
from service.core.database import get_db  # noqa: E402
from service.task.router import router as task_router  # noqa: E402

PREFIX = "/api/tasks"


class _ActorHolder:
    """Switchable current user; ``None`` simulates an unauthenticated call."""

    def __init__(self):
        self.user = None


@pytest.fixture()
def api(db, make_user):
    app = FastAPI()
    app.include_router(task_router)
    holder = _ActorHolder()

    def _override_db():
        yield db

    def _override_user():
        if holder.user is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return holder.user

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user
    client = TestClient(app)
    return client, holder, make_user


def _as(holder, user):
    holder.user = user


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


def test_unauthenticated_requests_rejected(api):
    client, holder, _make = api
    holder.user = None
    for method, path in (("get", PREFIX), ("post", PREFIX)):
        res = getattr(client, method)(path, json={"title": "x"} if method == "post" else None)
        assert res.status_code == 401
        assert res.json() == {"detail": "Not authenticated"}


def test_authenticated_request_passes(api, make_user):
    client, holder, make_user = api
    _as(holder, make_user("alice"))
    res = client.get(PREFIX)
    assert res.status_code == 200
    assert res.json() == {"items": [], "total": 0, "limit": 20, "offset": 0}


# ---------------------------------------------------------------------------
# Task CRUD through the API
# ---------------------------------------------------------------------------


def test_task_crud_flow(api):
    client, holder, make_user = api
    alice = make_user("alice")
    _as(holder, alice)

    res = client.post(PREFIX, json={"title": "Write docs", "priority": "high"})
    assert res.status_code == 201
    body = res.json()
    assert body["status"] == "todo"
    assert body["priority"] == "high"
    assert body["created_by"] == alice.id
    task_id = body["id"]

    res = client.get(f"{PREFIX}/{task_id}")
    assert res.status_code == 200
    assert res.json()["title"] == "Write docs"

    res = client.patch(f"{PREFIX}/{task_id}", json={"title": "Write API docs"})
    assert res.status_code == 200
    assert res.json()["title"] == "Write API docs"

    res = client.put(f"{PREFIX}/{task_id}/status", json={"status": "done"})
    assert res.status_code == 200
    assert res.json()["status"] == "done"
    assert res.json()["completed_at"] is not None

    res = client.delete(f"{PREFIX}/{task_id}")
    assert res.status_code == 204

    res = client.get(f"{PREFIX}/{task_id}")
    assert res.status_code == 404
    assert res.json() == {"detail": "Task not found"}


def test_create_validation_errors(api):
    client, holder, make_user = api
    _as(holder, make_user("alice"))
    res = client.post(PREFIX, json={"title": "   "})
    assert res.status_code == 422
    res = client.post(PREFIX, json={"title": "ok", "priority": "critical"})
    assert res.status_code == 422


def test_patch_rejects_status_field(api):
    client, holder, make_user = api
    _as(holder, make_user("alice"))
    task_id = client.post(PREFIX, json={"title": "t"}).json()["id"]
    res = client.patch(f"{PREFIX}/{task_id}", json={"status": "done"})
    assert res.status_code == 422  # extra/unknown field rejected by the schema


# ---------------------------------------------------------------------------
# Object-level authorization / IDOR
# ---------------------------------------------------------------------------


def test_idor_prevented_for_strangers(api):
    client, holder, make_user = api
    alice, bob = make_user("alice"), make_user("bob")
    _as(holder, alice)
    task_id = client.post(PREFIX, json={"title": "Alice private"}).json()["id"]

    _as(holder, bob)
    assert client.get(f"{PREFIX}/{task_id}").status_code == 404
    assert client.patch(f"{PREFIX}/{task_id}", json={"title": "hijack"}).status_code == 404
    assert client.delete(f"{PREFIX}/{task_id}").status_code == 404
    assert client.put(f"{PREFIX}/{task_id}/status", json={"status": "done"}).status_code == 404
    assert client.get(f"{PREFIX}/{task_id}/comments").status_code == 404
    assert client.get(f"{PREFIX}/{task_id}/activities").status_code == 404
    # Guessed ids behave identically to foreign ids:
    assert client.get(f"{PREFIX}/999999").status_code == 404


def test_cross_team_data_isolation(api):
    client, holder, make_user = api
    alice, bob = make_user("alice"), make_user("bob")
    _as(holder, alice)
    for title in ("Alice 1", "Alice 2", "Alice 3"):
        client.post(PREFIX, json={"title": title})

    _as(holder, bob)
    res = client.get(PREFIX)
    assert res.json()["total"] == 0
    assert res.json()["items"] == []
    stats = client.get(f"{PREFIX}/statistics").json()
    assert stats["total"] == 0
    my = client.get(f"{PREFIX}/my").json()
    assert my["total"] == 0


def test_assignee_access_matrix(api):
    client, holder, make_user = api
    alice, bob = make_user("alice"), make_user("bob")
    _as(holder, alice)
    task_id = client.post(PREFIX, json={"title": "Shared"}).json()["id"]
    client.post(f"{PREFIX}/{task_id}/assignments", json={"assigned_user_id": bob.id})

    _as(holder, bob)
    # Assignee: may view, change status, comment.
    assert client.get(f"{PREFIX}/{task_id}").status_code == 200
    assert client.put(f"{PREFIX}/{task_id}/status", json={"status": "in_progress"}).status_code == 200
    assert client.post(f"{PREFIX}/{task_id}/comments", json={"content": "hi"}).status_code == 201
    # ...but may not restructure, delete, or manage assignments.
    assert client.patch(f"{PREFIX}/{task_id}", json={"title": "nope"}).status_code == 403
    assert client.delete(f"{PREFIX}/{task_id}").status_code == 403
    assert client.post(
        f"{PREFIX}/{task_id}/assignments", json={"assigned_user_id": alice.id}
    ).status_code == 403
    assert client.delete(f"{PREFIX}/{task_id}/assignments/{alice.id}").status_code == 403
    assert client.put(f"{PREFIX}/{task_id}/parent", json={"parent_task_id": None}).status_code == 403


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------


def test_assignment_endpoints(api):
    client, holder, make_user = api
    alice, bob, carol = make_user("alice"), make_user("bob"), make_user("carol")
    _as(holder, alice)
    task_id = client.post(PREFIX, json={"title": "Delegate"}).json()["id"]

    res = client.post(f"{PREFIX}/{task_id}/assignments", json={"assigned_user_id": bob.id})
    assert res.status_code == 200
    active = [a for a in res.json()["assignments"] if a["assignment_status"] == "active"]
    assert [a["assigned_user_id"] for a in active] == [bob.id]

    # Idempotent duplicate -> still one active row.
    client.post(f"{PREFIX}/{task_id}/assignments", json={"assigned_user_id": bob.id})
    res = client.get(f"{PREFIX}/{task_id}")
    active = [a for a in res.json()["assignments"] if a["assignment_status"] == "active"]
    assert len(active) == 1

    # Reassignment replaces active assignees.
    res = client.put(f"{PREFIX}/{task_id}/assignee", json={"assigned_user_id": carol.id})
    active = [a for a in res.json()["assignments"] if a["assignment_status"] == "active"]
    assert [a["assigned_user_id"] for a in active] == [carol.id]

    # Unknown target -> 400.
    res = client.post(f"{PREFIX}/{task_id}/assignments", json={"assigned_user_id": 987654})
    assert res.status_code == 400

    # Views reflect active assignments: carol active, bob cancelled.
    _as(holder, carol)
    assert client.get(f"{PREFIX}/my").json()["total"] == 1
    _as(holder, bob)
    assert client.get(f"{PREFIX}/my").json()["total"] == 0
    _as(holder, alice)
    assert client.get(f"{PREFIX}/assigned-by-me").json()["total"] == 1

    # Unassign -> 204, idempotent.
    assert client.delete(f"{PREFIX}/{task_id}/assignments/{carol.id}").status_code == 204
    assert client.delete(f"{PREFIX}/{task_id}/assignments/{carol.id}").status_code == 204

    # Nothing actively delegated anymore.
    _as(holder, alice)
    assert client.get(f"{PREFIX}/assigned-by-me").json()["total"] == 0
    _as(holder, carol)
    assert client.get(f"{PREFIX}/my").json()["total"] == 0


# ---------------------------------------------------------------------------
# Subtasks + hierarchy
# ---------------------------------------------------------------------------


def test_subtask_endpoints_and_cycles(api):
    client, holder, make_user = api
    alice = make_user("alice")
    _as(holder, alice)
    parent_id = client.post(PREFIX, json={"title": "Epic"}).json()["id"]

    res = client.post(
        f"{PREFIX}/{parent_id}/subtasks",
        json={"title": "Story", "parent_task_id": parent_id},
    )
    assert res.status_code == 201
    child_id = res.json()["id"]
    assert res.json()["parent_task_id"] == parent_id

    res = client.get(f"{PREFIX}/{parent_id}/subtasks")
    assert res.status_code == 200 and res.json()["total"] == 1

    res = client.get(f"{PREFIX}/{child_id}/parent")
    assert res.status_code == 200 and res.json()["id"] == parent_id

    # Cycle: making the child the parent of its own grandparent.
    grandchild_id = client.post(
        f"{PREFIX}/{child_id}/subtasks",
        json={"title": "Task", "parent_task_id": child_id},
    ).json()["id"]
    res = client.put(f"{PREFIX}/{parent_id}/parent", json={"parent_task_id": grandchild_id})
    assert res.status_code == 400
    assert "Circular" in res.json()["detail"]

    # Body/URL mismatch -> 400.
    res = client.post(f"{PREFIX}/{parent_id}/subtasks", json={"title": "x", "parent_task_id": child_id})
    assert res.status_code == 400

    # Detach parent.
    res = client.put(f"{PREFIX}/{child_id}/parent", json={"parent_task_id": None})
    assert res.status_code == 200 and res.json()["parent_task_id"] is None


# ---------------------------------------------------------------------------
# Comments and activity
# ---------------------------------------------------------------------------


def test_comment_endpoints(api):
    client, holder, make_user = api
    alice, bob = make_user("alice"), make_user("bob")
    _as(holder, alice)
    task_id = client.post(PREFIX, json={"title": "t"}).json()["id"]
    client.post(f"{PREFIX}/{task_id}/assignments", json={"assigned_user_id": bob.id})

    _as(holder, bob)
    res = client.post(f"{PREFIX}/{task_id}/comments", json={"content": "looks good"})
    assert res.status_code == 201
    comment_id = res.json()["id"]
    assert res.json()["user_id"] == bob.id

    res = client.get(f"{PREFIX}/{task_id}/comments")
    assert res.status_code == 200 and res.json()["total"] == 1

    _as(holder, alice)
    assert client.delete(f"{PREFIX}/{task_id}/comments/{comment_id}").status_code == 403
    _as(holder, bob)
    assert client.delete(f"{PREFIX}/{task_id}/comments/{comment_id}").status_code == 204
    assert client.delete(f"{PREFIX}/{task_id}/comments/{comment_id}").status_code == 404


def test_activity_endpoint(api):
    client, holder, make_user = api
    alice = make_user("alice")
    _as(holder, alice)
    task_id = client.post(PREFIX, json={"title": "audited"}).json()["id"]
    client.put(f"{PREFIX}/{task_id}/status", json={"status": "done"})

    res = client.get(f"{PREFIX}/{task_id}/activities")
    assert res.status_code == 200
    actions = [e["action"] for e in res.json()["items"]]
    assert "task_created" in actions and "status_changed" in actions
    # Newest first.
    assert res.json()["items"][0]["action"] == "status_changed"


# ---------------------------------------------------------------------------
# Filtering, search, pagination, statistics
# ---------------------------------------------------------------------------


def test_filtering_search_and_pagination(api):
    client, holder, make_user = api
    alice = make_user("alice")
    _as(holder, alice)
    for i in range(4):
        client.post(PREFIX, json={"title": f"Report {i}", "priority": "low" if i % 2 else "high"})
    client.post(PREFIX, json={"title": "Unrelated note"})

    res = client.get(PREFIX, params={"q": "report"})
    assert res.json()["total"] == 4

    res = client.get(PREFIX, params={"priority": ["high"]})
    assert res.json()["total"] == 2

    res = client.get(PREFIX, params={"limit": 2, "offset": 0})
    body = res.json()
    assert body["total"] == 5 and len(body["items"]) == 2

    res = client.get(PREFIX, params={"limit": 2, "offset": 4})
    assert len(res.json()["items"]) == 1

    res = client.get(PREFIX, params={"sort": "priority", "order": "desc"})
    priorities = [t["priority"] for t in res.json()["items"]]
    assert priorities[0] == "low"  # desc: low first

    res = client.get(PREFIX, params={"status": ["done"]})
    assert res.json()["total"] == 0


def test_invalid_filter_values(api):
    client, holder, make_user = api
    _as(holder, make_user("alice"))
    res = client.get(PREFIX, params={"status": ["archived"]})
    assert res.status_code == 422
    res = client.get(PREFIX, params={"limit": 500})
    assert res.status_code == 422


def test_statistics_endpoint(api):
    client, holder, make_user = api
    alice = make_user("alice")
    _as(holder, alice)
    t1 = client.post(PREFIX, json={"title": "a"}).json()["id"]
    client.post(PREFIX, json={"title": "b", "priority": "urgent"})
    client.put(f"{PREFIX}/{t1}/status", json={"status": "done"})

    stats = client.get(f"{PREFIX}/statistics").json()
    assert stats["total"] == 2
    assert stats["completed"] == 1
    assert stats["open"] == 1
    assert stats["completion_rate"] == 0.5
    assert stats["by_status"]["done"] == 1
    assert stats["by_priority"]["urgent"] == 1


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------


def test_label_endpoints(api):
    client, holder, make_user = api
    alice, bob = make_user("alice"), make_user("bob")
    _as(holder, alice)
    task_id = client.post(PREFIX, json={"title": "t"}).json()["id"]

    res = client.post(f"{PREFIX}/labels", json={"name": "ops", "color": "#3366ff"})
    assert res.status_code == 201
    label_id = res.json()["id"]

    # Bob cannot see or use Alice's label.
    _as(holder, bob)
    assert client.put(f"{PREFIX}/{task_id}/labels/{label_id}").status_code == 404
    assert client.patch(f"{PREFIX}/labels/{label_id}", json={"name": "steal"}).status_code == 404

    _as(holder, alice)
    res = client.put(f"{PREFIX}/{task_id}/labels/{label_id}")
    assert res.status_code == 200
    assert [l["name"] for l in res.json()["labels"]] == ["ops"]

    # Duplicate attach is idempotent.
    res = client.put(f"{PREFIX}/{task_id}/labels/{label_id}")
    assert res.status_code == 200 and len(res.json()["labels"]) == 1

    res = client.get(PREFIX, params={"label_id": label_id})
    assert res.json()["total"] == 1

    res = client.get(f"{PREFIX}/labels")
    assert res.json()["total"] == 1

    assert client.delete(f"{PREFIX}/{task_id}/labels/{label_id}").status_code == 204
    assert client.get(PREFIX, params={"label_id": label_id}).json()["total"] == 0
    assert client.delete(f"{PREFIX}/labels/{label_id}").status_code == 204
