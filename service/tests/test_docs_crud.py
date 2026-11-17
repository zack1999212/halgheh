"""HTTP-level tests for Document CRUD under /documents/v1.

Covers the requested scenarios:
- successful create / read / update / soft-delete / restore
- invalid ids (404)
- unauthorized access (401)
- ownership violations (private content never exposed: 404 / 403)
- deleted-document behavior (trash lists, restore, content preserved)
- pagination and filtering (workspace, folder, archived, deleted, q, sort)

Runs against a disposable PostgreSQL database created in
service/tests/conftest.py (development database is never touched).
"""

import uuid

BASE = "/documents/v1"


# ------------------------------------------------------------------ helpers


def unique_suffix() -> str:
    return uuid.uuid4().hex[:8]


def create_workspace(client, user, name: str = "WS") -> dict:
    response = client.post(
        f"{BASE}/workspaces", json={"name": name}, headers=user.headers
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_folder(client, user, workspace_id: int, name: str) -> dict:
    response = client.post(
        f"{BASE}/folders",
        json={"workspace_id": workspace_id, "name": name},
        headers=user.headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_document(
    client,
    user,
    workspace_id: int,
    title: str,
    content: str = "",
    folder_id: int | None = None,
) -> dict:
    payload = {"workspace_id": workspace_id, "title": title, "content": content}
    if folder_id is not None:
        payload["folder_id"] = folder_id
    response = client.post(f"{BASE}/documents", json=payload, headers=user.headers)
    assert response.status_code == 201, response.text
    return response.json()


def create_tag(client, user, workspace_id: int, name: str) -> dict:
    response = client.post(
        f"{BASE}/tags",
        json={"workspace_id": workspace_id, "name": name, "color": "#ff0000"},
        headers=user.headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def grant_permission(client, owner, document_id: int, user_id: int, level: str):
    response = client.post(
        f"{BASE}/documents/{document_id}/permissions",
        json={"user_id": user_id, "permission_level": level},
        headers=owner.headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def get_document(client, user, document_id: int):
    return client.get(f"{BASE}/documents/{document_id}", headers=user.headers)


def patch_document(client, user, document_id: int, payload: dict):
    return client.patch(
        f"{BASE}/documents/{document_id}", json=payload, headers=user.headers
    )


def delete_document(client, user, document_id: int):
    return client.delete(
        f"{BASE}/documents/{document_id}", headers=user.headers
    )


def list_documents(client, user, params: dict | None = None):
    return client.get(f"{BASE}/documents", params=params or {}, headers=user.headers)


# ------------------------------------------------------------ CREATE / READ


def test_create_document_returns_owner_slug_and_timestamps(client, owner):
    workspace = create_workspace(client, owner, "Create WS")
    suffix = unique_suffix()

    created = create_document(
        client,
        owner,
        workspace["id"],
        title=f"Design Overview {suffix}",
        content="# Heading\n\nMarkdown **body**.",
    )

    # Ownership comes from the token, never from the client.
    assert created["owner_id"] == owner.id
    assert created["workspace_id"] == workspace["id"]
    assert created["folder_id"] is None
    assert created["title"] == f"Design Overview {suffix}"
    assert created["content"] == "# Heading\n\nMarkdown **body**."
    assert created["slug"].startswith("design-overview")
    assert created["is_deleted"] is False
    assert created["created_at"] and created["updated_at"]


def test_create_document_ignores_client_supplied_owner_id(client, owner):
    workspace = create_workspace(client, owner, "Owner From Token")
    suffix = unique_suffix()

    created = create_document(client, owner, workspace["id"], title=f"Doc {suffix}")
    hijack = client.post(
        f"{BASE}/documents",
        json={
            "workspace_id": workspace["id"],
            "title": f"Hijack {suffix}",
            # A malicious client may send owner_id; the schema has no such
            # field, so the document is owned by the authenticated user.
            "owner_id": 999_999,
        },
        headers=owner.headers,
    )
    assert hijack.status_code == 201, hijack.text
    assert hijack.json()["owner_id"] == owner.id
    assert hijack.json()["owner_id"] != 999_999
    assert created["owner_id"] == owner.id


def test_create_document_unique_slug_within_workspace(client, owner):
    workspace = create_workspace(client, owner, "Slug WS")
    suffix = unique_suffix()
    title = f"Roadmap {suffix}"

    first = create_document(client, owner, workspace["id"], title=title)
    second = create_document(client, owner, workspace["id"], title=title)

    assert first["slug"] != second["slug"]
    assert second["slug"] == f"{first['slug']}-2"
    # Slugs are scoped per workspace: the same title in another workspace
    # reuses the plain slug.
    other = create_workspace(client, owner, "Slug WS 2")
    third = create_document(client, owner, other["id"], title=title)
    assert third["slug"] == first["slug"]


def test_create_document_in_folder(client, owner):
    workspace = create_workspace(client, owner, "Folder WS")
    folder = create_folder(client, owner, workspace["id"], f"Specs {unique_suffix()}")

    created = create_document(
        client,
        owner,
        workspace["id"],
        title=f"Spec Doc {unique_suffix()}",
        folder_id=folder["id"],
    )
    assert created["folder_id"] == folder["id"]


def test_read_document_returns_title_content_folder_tags_timestamps(client, owner):
    workspace = create_workspace(client, owner, "Read WS")
    suffix = unique_suffix()
    folder = create_folder(client, owner, workspace["id"], f"Specs {suffix}")
    tag = create_tag(client, owner, workspace["id"], f"urgent-{suffix}")
    document = create_document(
        client,
        owner,
        workspace["id"],
        title=f"Deep Read {suffix}",
        content="# Body",
        folder_id=folder["id"],
    )
    attached = client.post(
        f"{BASE}/documents/{document['id']}/tags?tag_id={tag['id']}",
        headers=owner.headers,
    )
    assert attached.status_code == 201, attached.text

    response = get_document(client, owner, document["id"])
    assert response.status_code == 200, response.text
    detail = response.json()

    assert detail["id"] == document["id"]
    assert detail["title"] == f"Deep Read {suffix}"
    assert detail["content"] == "# Body"
    assert detail["folder_id"] == folder["id"]
    # Folder object and tags are embedded in the detail view.
    assert detail["folder"]["id"] == folder["id"]
    assert detail["folder"]["name"] == f"Specs {suffix}"
    assert [t["id"] for t in detail["tags"]] == [tag["id"]]
    assert detail["is_favorite"] is False
    assert detail["is_deleted"] is False
    assert detail["created_at"] and detail["updated_at"]
    # List responses stay lightweight: no folder/tags objects there.
    listed = list_documents(client, owner, {"workspace_id": workspace["id"]})
    item = next(i for i in listed.json()["items"] if i["id"] == document["id"])
    assert "tags" not in item and "folder" not in item


# ------------------------------------------------------------------- UPDATE


def test_update_title_content_and_updated_at(client, owner):
    workspace = create_workspace(client, owner, "Update WS")
    suffix = unique_suffix()
    document = create_document(
        client, owner, workspace["id"], title=f"Draft {suffix}", content="v1"
    )

    renamed = patch_document(
        client, owner, document["id"], {"title": f"Renamed {suffix}"}
    )
    assert renamed.status_code == 200, renamed.text
    body = renamed.json()
    # Slugs stay stable across renames so links never break.
    assert body["slug"] == document["slug"]
    assert body["title"] == f"Renamed {suffix}"
    assert body["updated_at"] >= body["created_at"]

    rewritten = patch_document(
        client, owner, document["id"], {"content": "v2 with changes"}
    )
    assert rewritten.status_code == 200, rewritten.text
    assert rewritten.json()["content"] == "v2 with changes"
    assert rewritten.json()["updated_at"] >= body["updated_at"]

    # Content changes snapshot immutable versions: create = v1, rename = v2,
    # rewrite = v3. v1 is preserved.
    versions = client.get(
        f"{BASE}/documents/{document['id']}/versions", headers=owner.headers
    )
    assert versions.status_code == 200, versions.text
    assert versions.json()["total"] == 3
    numbers = [v["version_number"] for v in versions.json()["items"]]
    assert numbers == [3, 2, 1]
    first = client.get(
        f"{BASE}/documents/{document['id']}/versions/1", headers=owner.headers
    )
    assert first.json()["content"] == "v1"
    assert first.json()["created_by"] == owner.id


def test_update_metadata_and_move_between_folders(client, owner):
    workspace = create_workspace(client, owner, "Move WS")
    suffix = unique_suffix()
    folder_a = create_folder(client, owner, workspace["id"], f"A {suffix}")
    folder_b = create_folder(client, owner, workspace["id"], f"B {suffix}")
    document = create_document(
        client,
        owner,
        workspace["id"],
        title=f"Mover {suffix}",
        folder_id=folder_a["id"],
    )

    moved = patch_document(
        client, owner, document["id"], {"folder_id": folder_b["id"]}
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["folder_id"] == folder_b["id"]

    icon = patch_document(client, owner, document["id"], {"icon": "📄"})
    assert icon.status_code == 200, icon.text
    assert icon.json()["icon"] == "📄"

    detail = get_document(client, owner, document["id"])
    assert detail.json()["folder"]["name"] == f"B {suffix}"


def test_move_to_folder_of_other_workspace_rejected(client, owner):
    ws_one = create_workspace(client, owner, "Move Src")
    ws_two = create_workspace(client, owner, "Move Dst")
    suffix = unique_suffix()
    foreign_folder = create_folder(client, owner, ws_two["id"], f"Foreign {suffix}")
    document = create_document(client, owner, ws_one["id"], title=f"Movee {suffix}")

    response = patch_document(
        client, owner, document["id"], {"folder_id": foreign_folder["id"]}
    )
    assert response.status_code == 404, response.text
    # The document did not move.
    assert get_document(client, owner, document["id"]).json()["folder_id"] is None


def test_empty_update_body_rejected(client, owner):
    workspace = create_workspace(client, owner, "Empty Patch WS")
    document = create_document(client, owner, workspace["id"], "Title x")
    response = patch_document(client, owner, document["id"], {})
    assert response.status_code == 422, response.text


# --------------------------------------------------------------- INVALID IDs


def test_invalid_document_id_returns_404(client, owner):
    for method, path in (
        (client.get, f"{BASE}/documents/999999"),
        (client.patch, f"{BASE}/documents/999999"),
        (client.delete, f"{BASE}/documents/999999"),
        (client.get, f"{BASE}/documents/999999/versions"),
        (client.post, f"{BASE}/documents/999999/restore"),
    ):
        kwargs = {"headers": owner.headers}
        if method is client.patch:
            kwargs["json"] = {"title": "nope"}
        response = method(path, **kwargs)
        assert response.status_code == 404, f"{path}: {response.text}"
        assert response.json()["detail"] == "Document not found"


def test_create_with_unknown_folder_or_workspace_returns_404(client, owner):
    response = client.post(
        f"{BASE}/documents",
        json={"workspace_id": 999_999, "title": "Orphan"},
        headers=owner.headers,
    )
    assert response.status_code == 404, response.text
    assert response.json()["detail"] == "Workspace not found"

    workspace = create_workspace(client, owner, "No Folder WS")
    response = client.post(
        f"{BASE}/documents",
        json={"workspace_id": workspace["id"], "title": "Orphan", "folder_id": 999_999},
        headers=owner.headers,
    )
    assert response.status_code == 404, response.text
    assert response.json()["detail"] == "Folder not found"


# ------------------------------------------------------------- UNAUTHORIZED


def test_unauthenticated_requests_rejected(client, owner):
    workspace = create_workspace(client, owner, "Auth WS")
    document = create_document(client, owner, workspace["id"], "Secret doc")

    for method, path, kwargs in (
        (client.post, f"{BASE}/documents", {"json": {"workspace_id": workspace["id"], "title": "x"}}),
        (client.get, f"{BASE}/documents/{document['id']}", {}),
        (client.patch, f"{BASE}/documents/{document['id']}", {"json": {"title": "x"}}),
        (client.delete, f"{BASE}/documents/{document['id']}", {}),
        (client.get, f"{BASE}/documents", {}),
    ):
        response = method(path, **kwargs)  # no Authorization header
        assert response.status_code == 401, f"{path}: {response.text}"
        assert response.json()["detail"] == "Not authenticated"

    garbage = client.get(
        f"{BASE}/documents/{document['id']}",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert garbage.status_code == 401, garbage.text


# ----------------------------------------------------- OWNERSHIP VIOLATIONS


def test_private_document_hidden_from_other_users(client, owner, stranger):
    workspace = create_workspace(client, owner, "Private WS")
    folder = create_folder(client, owner, workspace["id"], "Private folder")
    document = create_document(
        client,
        owner,
        workspace["id"],
        title=f"Private {unique_suffix()}",
        content="Owner only",
        folder_id=folder["id"],
    )

    # Same 404 as an unknown id: existence is not revealed.
    assert get_document(client, stranger, document["id"]).status_code == 404
    assert (
        patch_document(client, stranger, document["id"], {"title": "stolen"}).status_code
        == 404
    )
    assert delete_document(client, stranger, document["id"]).status_code == 404
    assert (
        client.get(
            f"{BASE}/documents/{document['id']}/versions", headers=stranger.headers
        ).status_code
        == 404
    )

    # Stranger cannot create documents inside the owner's workspace...
    response = client.post(
        f"{BASE}/documents",
        json={"workspace_id": workspace["id"], "title": "intruder"},
        headers=stranger.headers,
    )
    assert response.status_code == 404, response.text
    # ...nor see the workspace or its folders.
    assert (
        client.get(
            f"{BASE}/workspaces/{workspace['id']}", headers=stranger.headers
        ).status_code
        == 404
    )
    folders = client.get(
        f"{BASE}/folders",
        params={"workspace_id": workspace["id"]},
        headers=stranger.headers,
    )
    assert folders.status_code == 404, folders.text

    # And the stranger's own listing never contains the private document.
    stranger_list = list_documents(client, stranger, {"q": "Private"})
    assert stranger_list.json()["total"] == 0


def test_workspace_owner_isolation_between_users(client, owner, stranger):
    mine = create_workspace(client, owner, "Owner View")
    create_document(client, owner, mine["id"], f"Owner doc {unique_suffix()}")
    theirs = create_workspace(client, stranger, "Stranger View")
    create_document(client, stranger, theirs["id"], f"Stranger doc {unique_suffix()}")

    owner_titles = [i["title"] for i in list_documents(client, owner).json()["items"]]
    stranger_titles = [
        i["title"] for i in list_documents(client, stranger).json()["items"]
    ]
    assert not any("Stranger doc" in t for t in owner_titles)
    assert not any("Owner doc" in t for t in stranger_titles)


def test_granted_viewer_can_read_but_not_modify(client, owner, stranger):
    workspace = create_workspace(client, owner, "Viewer WS")
    document = create_document(
        client, owner, workspace["id"], f"Shared {unique_suffix()}", "read me"
    )
    grant_permission(client, owner, document["id"], stranger.id, "viewer")

    readable = get_document(client, stranger, document["id"])
    assert readable.status_code == 200, readable.text
    assert readable.json()["content"] == "read me"
    # Viewer sees the same document in their list.
    viewer_list = list_documents(client, stranger)
    assert any(i["id"] == document["id"] for i in viewer_list.json()["items"])

    forbidden = patch_document(client, stranger, document["id"], {"title": "nope"})
    assert forbidden.status_code == 403, forbidden.text
    assert delete_document(client, stranger, document["id"]).status_code == 403
    # Non-owners cannot manage permissions either.
    grants = client.get(
        f"{BASE}/documents/{document['id']}/permissions", headers=stranger.headers
    )
    assert grants.status_code == 403, grants.text


def test_granted_editor_can_update(client, owner, stranger):
    workspace = create_workspace(client, owner, "Editor WS")
    suffix = unique_suffix()
    document = create_document(
        client, owner, workspace["id"], f"Collab {suffix}", "original"
    )
    grant_permission(client, owner, document["id"], stranger.id, "editor")

    updated = patch_document(
        client, stranger, document["id"], {"content": "edited by editor"}
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["content"] == "edited by editor"

    # The editor's change is versioned with the editor as author.
    versions = client.get(
        f"{BASE}/documents/{document['id']}/versions", headers=owner.headers
    )
    latest = versions.json()["items"][0]
    assert latest["content"] == "edited by editor"
    assert latest["created_by"] == stranger.id


def test_only_owner_can_grant_permissions(client, owner, stranger):
    workspace = create_workspace(client, owner, "Grant WS")
    document = create_document(client, owner, workspace["id"], "Grant doc")
    grant_permission(client, owner, document["id"], stranger.id, "viewer")

    # A viewer cannot escalate themselves to editor.
    escalation = client.post(
        f"{BASE}/documents/{document['id']}/permissions",
        json={"user_id": stranger.id, "permission_level": "editor"},
        headers=stranger.headers,
    )
    assert escalation.status_code == 403, escalation.text


# ------------------------------------------------------ DELETED DOCUMENTS


def test_soft_delete_preserves_content_relationships_and_restores(client, owner):
    workspace = create_workspace(client, owner, "Trash WS")
    suffix = unique_suffix()
    folder = create_folder(client, owner, workspace["id"], f"Trash folder {suffix}")
    tag = create_tag(client, owner, workspace["id"], f"keep-{suffix}")
    document = create_document(
        client,
        owner,
        workspace["id"],
        title=f"Trashable {suffix}",
        content="precious content",
        folder_id=folder["id"],
    )
    client.post(
        f"{BASE}/documents/{document['id']}/tags?tag_id={tag['id']}",
        headers=owner.headers,
    )
    patch_document(client, owner, document["id"], {"content": "second version"})

    deleted = delete_document(client, owner, document["id"])
    assert deleted.status_code == 204, deleted.text

    # Soft delete: the row is still retrievable for the trash view with all
    # content and relationships intact.
    trashed = get_document(client, owner, document["id"])
    assert trashed.status_code == 200, trashed.text
    body = trashed.json()
    assert body["is_deleted"] is True
    assert body["content"] == "second version"
    assert body["folder_id"] == folder["id"]
    assert [t["id"] for t in body["tags"]] == [tag["id"]]
    versions = client.get(
        f"{BASE}/documents/{document['id']}/versions", headers=owner.headers
    )
    assert versions.json()["total"] == 2

    restored = client.post(
        f"{BASE}/documents/{document['id']}/restore", headers=owner.headers
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["is_deleted"] is False

    # After restore: same content, folder and tags, history intact.
    revived = get_document(client, owner, document["id"]).json()
    assert revived["is_deleted"] is False
    assert revived["content"] == "second version"
    assert revived["folder_id"] == folder["id"]
    assert [t["id"] for t in revived["tags"]] == [tag["id"]]


def test_deleted_document_list_behavior(client, owner):
    workspace = create_workspace(client, owner, "Trash List WS")
    suffix = unique_suffix()
    kept = create_document(
        client, owner, workspace["id"], title=f"Kept {suffix}"
    )
    trashed = create_document(
        client, owner, workspace["id"], title=f"Trashed {suffix}"
    )
    delete_document(client, owner, trashed["id"])

    # Default listing excludes trashed documents.
    active = list_documents(client, owner, {"workspace_id": workspace["id"]})
    active_ids = [i["id"] for i in active.json()["items"]]
    assert kept["id"] in active_ids
    assert trashed["id"] not in active_ids
    assert active.json()["total"] == 1

    # Trash view shows only deleted documents.
    trash = list_documents(
        client, owner, {"workspace_id": workspace["id"], "is_deleted": "true"}
    )
    trash_ids = [i["id"] for i in trash.json()["items"]]
    assert trash_ids == [trashed["id"]]
    assert all(i["is_deleted"] for i in trash.json()["items"])

    # Restoring puts it back into the default listing.
    client.post(f"{BASE}/documents/{trashed['id']}/restore", headers=owner.headers)
    again = list_documents(client, owner, {"workspace_id": workspace["id"]})
    assert again.json()["total"] == 2


def test_stranger_cannot_access_trashed_document(client, owner, stranger):
    workspace = create_workspace(client, owner, "Trash Privacy WS")
    document = create_document(client, owner, workspace["id"], "Hidden trash")
    delete_document(client, owner, document["id"])

    assert get_document(client, stranger, document["id"]).status_code == 404
    restore = client.post(
        f"{BASE}/documents/{document['id']}/restore", headers=stranger.headers
    )
    assert restore.status_code == 404, restore.text


# ------------------------------------------------- PAGINATION AND FILTERING


def test_document_pagination(client, owner):
    workspace = create_workspace(client, owner, "Paging WS")
    suffix = unique_suffix()
    ids = [
        create_document(client, owner, workspace["id"], title=f"Paged {n} {suffix}")["id"]
        for n in range(5)
    ]

    page_one = list_documents(
        client, owner, {"workspace_id": workspace["id"], "limit": 2, "offset": 0}
    ).json()
    assert page_one["total"] == 5
    assert page_one["limit"] == 2
    assert page_one["offset"] == 0
    assert len(page_one["items"]) == 2

    page_three = list_documents(
        client, owner, {"workspace_id": workspace["id"], "limit": 2, "offset": 4}
    ).json()
    assert len(page_three["items"]) == 1

    # Pages do not overlap and together cover everything exactly once.
    seen = [i["id"] for i in page_one["items"]] + [i["id"] for i in page_three["items"]]
    rest = list_documents(
        client, owner, {"workspace_id": workspace["id"], "limit": 2, "offset": 2}
    ).json()
    seen += [i["id"] for i in rest["items"]]
    assert sorted(seen) == sorted(ids)
    assert len(seen) == len(set(seen)) == 5


def test_document_filters(client, owner):
    ws_main = create_workspace(client, owner, "Filter WS")
    ws_other = create_workspace(client, owner, "Filter Other WS")
    suffix = unique_suffix()

    folder_alpha = create_folder(client, owner, ws_main["id"], f"Alpha {suffix}")
    folder_beta = create_folder(client, owner, ws_main["id"], f"Beta {suffix}")

    in_alpha = create_document(
        client, owner, ws_main["id"], title=f"Alpha note {suffix}", folder_id=folder_alpha["id"]
    )
    in_beta = create_document(
        client, owner, ws_main["id"], title=f"Beta note {suffix}", folder_id=folder_beta["id"]
    )
    at_root = create_document(
        client, owner, ws_main["id"], title=f"Root note {suffix}"
    )
    in_other_ws = create_document(
        client, owner, ws_other["id"], title=f"Other note {suffix}"
    )

    # Workspace filter: only that workspace's documents.
    main_ids = {
        i["id"]
        for i in list_documents(
            client, owner, {"workspace_id": ws_main["id"]}
        ).json()["items"]
    }
    assert main_ids == {in_alpha["id"], in_beta["id"], at_root["id"]}

    # Folder filter: only that folder's documents.
    alpha_ids = {
        i["id"]
        for i in list_documents(
            client, owner, {"workspace_id": ws_main["id"], "folder_id": folder_alpha["id"]}
        ).json()["items"]
    }
    assert alpha_ids == {in_alpha["id"]}

    # Title search.
    query = list_documents(
        client, owner, {"workspace_id": ws_main["id"], "q": f"Root note {suffix}"}
    ).json()
    assert [i["id"] for i in query["items"]] == [at_root["id"]]

    # Archived status: archive one, then filter both ways.
    archived = patch_document(
        client, owner, in_beta["id"], {"is_archived": True}
    ).json()
    assert archived["is_archived"] is True
    archive_view = list_documents(
        client, owner, {"workspace_id": ws_main["id"], "is_archived": "true"}
    ).json()
    assert [i["id"] for i in archive_view["items"]] == [in_beta["id"]]
    not_archived = list_documents(
        client, owner, {"workspace_id": ws_main["id"], "is_archived": "false"}
    ).json()
    assert {i["id"] for i in not_archived["items"]} == {in_alpha["id"], at_root["id"]}

    # Deleted status: trash one, then filter.
    delete_document(client, owner, at_root["id"])
    trash_view = list_documents(
        client, owner, {"workspace_id": ws_main["id"], "is_deleted": "true"}
    ).json()
    assert [i["id"] for i in trash_view["items"]] == [at_root["id"]]
    alive = list_documents(
        client, owner, {"workspace_id": ws_main["id"], "is_deleted": "false"}
    ).json()
    assert {i["id"] for i in alive["items"]} == {in_alpha["id"], in_beta["id"]}
    # The other workspace's document never leaks into these results.
    assert in_other_ws["id"] not in {i["id"] for i in alive["items"]}


def test_document_sorting(client, owner):
    workspace = create_workspace(client, owner, "Sort WS")
    suffix = unique_suffix()
    titles = [f"Sort me {letter} {suffix}" for letter in "cab"]
    for title in titles:
        create_document(client, owner, workspace["id"], title=title)

    ascending = list_documents(
        client,
        owner,
        {"workspace_id": workspace["id"], "sort": "title_asc", "q": suffix},
    ).json()
    assert [i["title"] for i in ascending["items"]] == sorted(titles)

    descending = list_documents(
        client,
        owner,
        {"workspace_id": workspace["id"], "sort": "title_desc", "q": suffix},
    ).json()
    assert [i["title"] for i in descending["items"]] == sorted(titles, reverse=True)


def test_invalid_pagination_and_sort_parameters_rejected(client, owner):
    response = list_documents(client, owner, {"limit": 0})
    assert response.status_code == 422, response.text
    response = list_documents(client, owner, {"limit": 201})
    assert response.status_code == 422, response.text
    response = list_documents(client, owner, {"offset": -1})
    assert response.status_code == 422, response.text
    response = list_documents(client, owner, {"sort": "not_a_sort"})
    assert response.status_code == 422, response.text
