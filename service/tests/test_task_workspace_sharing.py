"""Focused tests for the task_workspaces sharing foundation.

Runs against the disposable PostgreSQL test database configured in
service/tests/conftest.py. The development database is never touched.
"""

from __future__ import annotations

import uuid

from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from service.core.database import engine


def create_task(client, user, **overrides):
    payload = {
        "title": overrides.pop("title", "Sharing Task"),
        "description": overrides.pop("description", None),
        "priority": overrides.pop("priority", "medium"),
        "start_date": overrides.pop("start_date", None),
        "due_date": overrides.pop("due_date", None),
    }
    payload.update(overrides)
    res = client.post("/api/tasks", json=payload, headers=user.headers)
    assert res.status_code == 201, res.text
    return res.json()


def associations(task_id):
    with engine.connect() as conn:
        return [
            dict(row)
            for row in conn.execute(
                text(
                    """
                    SELECT workspace_id, is_original, permission_level, shared_by_user_id
                    FROM task_workspaces
                    WHERE task_id = :tid
                    ORDER BY workspace_id
                    """
                ),
                {"tid": task_id},
            ).mappings().all()
        ]


def tasks_without_single_original():
    with engine.connect() as conn:
        return conn.execute(
            text(
                """
                SELECT task_id
                FROM task_workspaces
                WHERE is_original
                GROUP BY task_id
                HAVING count(*) <> 1
                """
            )
        ).scalars().all()


def test_sharing_columns_and_constraints_exist(client):
    inspector = inspect(engine)
    columns = {c["name"] for c in inspector.get_columns("task_workspaces")}
    assert {"is_original", "permission_level", "shared_by_user_id"} <= columns
    assert any(
        c["name"] == "ck_task_workspaces_permission_level"
        for c in inspector.get_check_constraints("task_workspaces")
    )
    indexes = {i["name"] for i in inspector.get_indexes("task_workspaces")}
    assert "uq_task_workspaces_original_task" in indexes
    assert "ix_task_workspaces_shared_by_user_id" in indexes


def test_created_task_has_one_original_editor_association(client, make_user):
    user = make_user()
    task = create_task(client, user, title="Original workspace")

    rows = associations(task["id"])
    assert len(rows) == 1
    assert rows[0]["is_original"] is True
    assert rows[0]["permission_level"] == "editor"
    assert rows[0]["shared_by_user_id"] is None

    fresh = client.get(f"/api/tasks/{task['id']}", headers=user.headers)
    assert fresh.status_code == 200, fresh.text
    assert fresh.json()["id"] == task["id"]
    assert tasks_without_single_original() == []


def test_second_workspace_association_defaults_to_viewer(client, make_user):
    user = make_user()
    task = create_task(client, user, title="Shared task")
    ws = client.post(
        "/api/workspaces",
        json={"name": f"Shared {uuid.uuid4().hex[:8]}"},
        headers=user.headers,
    )
    assert ws.status_code == 201, ws.text
    workspace_id = ws.json()["id"]

    attach = client.post(
        f"/api/tasks/{task['id']}/workspaces/{workspace_id}",
        headers=user.headers,
    )
    assert attach.status_code == 201, attach.text

    rows = {row["workspace_id"]: row for row in associations(task["id"])}
    assert len(rows) == 2
    originals = [r for r in rows.values() if r["is_original"]]
    assert len(originals) == 1
    assert originals[0]["permission_level"] == "editor"
    shared = [r for r in rows.values() if not r["is_original"]]
    assert len(shared) == 1
    assert shared[0]["permission_level"] == "viewer"

    # Repeated attach is idempotent; no duplicate association is created.
    again = client.post(
        f"/api/tasks/{task['id']}/workspaces/{workspace_id}",
        headers=user.headers,
    )
    assert again.status_code == 201, again.text
    assert len(associations(task["id"])) == 2

    # The composite primary key still prevents duplicate pairs.
    with engine.connect() as conn:
        try:
            conn.execute(
                text(
                    """
                    INSERT INTO task_workspaces (task_id, workspace_id, is_original, permission_level)
                    VALUES (:tid, :wid, false, 'viewer')
                    """
                ),
                {"tid": task["id"], "wid": workspace_id},
            )
            conn.commit()
        except IntegrityError:
            conn.rollback()
        else:
            raise AssertionError("duplicate (task_id, workspace_id) was accepted")
    assert tasks_without_single_original() == []


def test_task_deletion_keeps_other_task_checklist_intact(client, make_user):
    user = make_user()
    doomed = create_task(client, user, title="Doomed")
    survivor = create_task(client, user, title="Survivor")

    item = client.post(
        f"/api/tasks/{survivor['id']}/checklist",
        json={"title": "Keep me"},
        headers=user.headers,
    )
    assert item.status_code == 201, item.text

    deleted = client.delete(f"/api/tasks/{doomed['id']}", headers=user.headers)
    assert deleted.status_code == 204, deleted.text
    assert associations(doomed["id"]) == []

    survivor_detail = client.get(f"/api/tasks/{survivor['id']}", headers=user.headers)
    assert survivor_detail.status_code == 200, survivor_detail.text
    items = client.get(
        f"/api/tasks/{survivor['id']}/checklist", headers=user.headers
    )
    assert items.status_code == 200, items.text
    assert [i["title"] for i in items.json()["items"]] == ["Keep me"]
    assert tasks_without_single_original() == []


# --- Phase 2: sharing authorization -----------------------------------------


def create_workspace(client, owner, name=None):
    res = client.post(
        "/api/workspaces",
        json={"name": name or f"Shared {uuid.uuid4().hex[:8]}"},
        headers=owner.headers,
    )
    assert res.status_code == 201, res.text
    return res.json()


def invite_and_accept(client, owner, workspace_id, member, role):
    invited = client.post(
        f"/api/workspaces/{workspace_id}/invitations",
        json={"username": member.username, "role": role},
        headers=owner.headers,
    )
    assert invited.status_code == 201, invited.text
    inbox = client.get("/api/workspace-invitations", headers=member.headers)
    assert inbox.status_code == 200, inbox.text
    invitation = next(
        (i for i in inbox.json() if i["workspace_id"] == workspace_id), None
    )
    assert invitation is not None
    accepted = client.post(
        f"/api/workspace-invitations/{invitation['id']}/accept",
        headers=member.headers,
    )
    assert accepted.status_code == 200, accepted.text


def share_task(client, owner, task_id, workspace_id, permission_level="viewer"):
    res = client.post(
        f"/api/tasks/{task_id}/workspaces/{workspace_id}",
        params={"permission_level": permission_level},
        headers=owner.headers,
    )
    assert res.status_code == 201, res.text
    return res.json()


def member_id(client, owner, workspace_id, user_id):
    members = client.get(f"/api/workspaces/{workspace_id}/members", headers=owner.headers)
    assert members.status_code == 200, members.text
    return next(m["id"] for m in members.json() if m["user_id"] == user_id)


def test_original_association_cannot_be_removed_or_downgraded(client, make_user):
    owner = make_user()
    task = create_task(client, owner, title="Original protected")
    original_ws = associations(task["id"])[0]["workspace_id"]

    removed = client.delete(
        f"/api/tasks/{task['id']}/workspaces/{original_ws}", headers=owner.headers
    )
    assert removed.status_code == 400, removed.text
    downgraded = client.patch(
        f"/api/tasks/{task['id']}/workspaces/{original_ws}",
        params={"permission_level": "viewer"},
        headers=owner.headers,
    )
    assert downgraded.status_code == 400, downgraded.text
    row = associations(task["id"])[0]
    assert row["is_original"] is True and row["permission_level"] == "editor"


def test_viewer_can_read_but_not_mutate_shared_task(client, make_user):
    owner = make_user()
    viewer = make_user()
    task = create_task(client, owner, title="Viewer shared")
    ws = create_workspace(client, owner)
    invite_and_accept(client, owner, ws["id"], viewer, "viewer")
    share_task(client, owner, task["id"], ws["id"], "viewer")

    detail = client.get(
        f"/api/tasks/{task['id']}",
        params={"workspace_id": ws["id"]},
        headers=viewer.headers,
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["title"] == "Viewer shared"

    checklist = client.get(
        f"/api/tasks/{task['id']}/checklist",
        params={"workspace_id": ws["id"]},
        headers=viewer.headers,
    )
    assert checklist.status_code == 200, checklist.text

    forbidden = [
        client.patch(
            f"/api/tasks/{task['id']}", params={"workspace_id": ws["id"]},
            json={"title": "hacked"}, headers=viewer.headers,
        ),
        client.put(
            f"/api/tasks/{task['id']}/status", params={"workspace_id": ws["id"]},
            json={"status": "in_progress"}, headers=viewer.headers,
        ),
        client.patch(
            f"/api/tasks/{task['id']}/position", params={"workspace_id": ws["id"]},
            json={"target_priority": "high"}, headers=viewer.headers,
        ),
        client.post(
            f"/api/tasks/{task['id']}/checklist", params={"workspace_id": ws["id"]},
            json={"title": "hacked"}, headers=viewer.headers,
        ),
        client.post(
            f"/api/tasks/{task['id']}/comments", params={"workspace_id": ws["id"]},
            json={"content": "hacked"}, headers=viewer.headers,
        ),
        client.post(
            f"/api/tasks/{task['id']}/assignments", params={"workspace_id": ws["id"]},
            json={"assigned_user_id": viewer.id}, headers=viewer.headers,
        ),
    ]
    assert all(r.status_code == 403 for r in forbidden), [r.text for r in forbidden]


def test_editor_can_edit_but_not_delete_or_share(client, make_user):
    owner = make_user()
    editor = make_user()
    task = create_task(client, owner, title="Editor shared")
    ws = create_workspace(client, owner)
    invite_and_accept(client, owner, ws["id"], editor, "editor")
    share_task(client, owner, task["id"], ws["id"], "editor")

    updated = client.patch(
        f"/api/tasks/{task['id']}", params={"workspace_id": ws["id"]},
        json={"title": "Editor updated", "description": "ok"}, headers=editor.headers,
    )
    assert updated.status_code == 200, updated.text
    status = client.put(
        f"/api/tasks/{task['id']}/status", params={"workspace_id": ws["id"]},
        json={"status": "in_progress"}, headers=editor.headers,
    )
    assert status.status_code == 200, status.text
    item = client.post(
        f"/api/tasks/{task['id']}/checklist", params={"workspace_id": ws["id"]},
        json={"title": "Editor item"}, headers=editor.headers,
    )
    assert item.status_code == 201, item.text

    other_ws = create_workspace(client, owner, name="Another workspace")
    denied = [
        client.delete(
            f"/api/tasks/{task['id']}", params={"workspace_id": ws["id"]},
            headers=editor.headers,
        ),
        client.post(
            f"/api/tasks/{task['id']}/workspaces/{other_ws['id']}",
            params={"workspace_id": ws["id"]}, headers=editor.headers,
        ),
        client.patch(
            f"/api/tasks/{task['id']}/workspaces/{ws['id']}",
            params={"permission_level": "viewer", "workspace_id": ws["id"]},
            headers=editor.headers,
        ),
    ]
    assert all(r.status_code == 403 for r in denied), [r.text for r in denied]


def test_unrelated_users_and_removed_members_lose_access(client, make_user):
    owner = make_user()
    viewer = make_user()
    stranger = make_user()
    task = create_task(client, owner, title="Access test")
    ws = create_workspace(client, owner)
    invite_and_accept(client, owner, ws["id"], viewer, "viewer")
    share_task(client, owner, task["id"], ws["id"], "viewer")

    stranger_detail = client.get(
        f"/api/tasks/{task['id']}", params={"workspace_id": ws["id"]},
        headers=stranger.headers,
    )
    assert stranger_detail.status_code == 404, stranger_detail.text

    mid = member_id(client, owner, ws["id"], viewer.id)
    removed = client.delete(f"/api/workspaces/{ws['id']}/members/{mid}", headers=owner.headers)
    assert removed.status_code == 204, removed.text
    lost = client.get(
        f"/api/tasks/{task['id']}", params={"workspace_id": ws["id"]},
        headers=viewer.headers,
    )
    assert lost.status_code == 404, lost.text


def test_unshare_preserves_task_and_removes_destination_access(client, make_user):
    owner = make_user()
    viewer = make_user()
    task = create_task(client, owner, title="Unshare test")
    ws = create_workspace(client, owner)
    invite_and_accept(client, owner, ws["id"], viewer, "viewer")
    share_task(client, owner, task["id"], ws["id"], "viewer")

    duplicate = share_task(client, owner, task["id"], ws["id"], "editor")
    assert duplicate["attached"] is False
    assert len(associations(task["id"])) == 2

    invalid = client.post(
        f"/api/tasks/{task['id']}/workspaces/{ws['id']}",
        params={"permission_level": "admin"}, headers=owner.headers,
    )
    assert invalid.status_code in (400, 422), invalid.text

    unshared = client.delete(
        f"/api/tasks/{task['id']}/workspaces/{ws['id']}", headers=owner.headers
    )
    assert unshared.status_code == 204, unshared.text
    assert len(associations(task["id"])) == 1
    assert client.get(f"/api/tasks/{task['id']}", headers=owner.headers).status_code == 200
    assert client.get(
        f"/api/tasks/{task['id']}", params={"workspace_id": ws["id"]},
        headers=viewer.headers,
    ).status_code == 404

    missing = client.delete(
        f"/api/tasks/{task['id']}/workspaces/{ws['id']}", headers=owner.headers
    )
    assert missing.status_code == 404, missing.text


def test_list_task_workspaces_exposes_only_authorized_workspaces(client, make_user):
    owner = make_user()
    viewer = make_user()
    task = create_task(client, owner, title="List shares")
    ws = create_workspace(client, owner)
    share_task(client, owner, task["id"], ws["id"], "viewer")

    owner_view = client.get(f"/api/tasks/{task['id']}/workspaces", headers=owner.headers)
    assert owner_view.status_code == 200, owner_view.text
    assert len(owner_view.json()) == 2

    stranger_view = client.get(
        f"/api/tasks/{task['id']}/workspaces", headers=viewer.headers
    )
    assert stranger_view.status_code == 200, stranger_view.text
    assert all(item["workspace_id"] != ws["id"] for item in stranger_view.json())
