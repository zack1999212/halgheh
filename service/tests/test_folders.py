"""HTTP-level tests for hierarchical folder management under /documents/v1.

Covers:
- creating folders inside workspaces (nested via parent_id)
- retrieving folders as a hierarchical tree
- renaming folders (with sibling-name conflicts)
- moving folders between parents, and back to the root
- guards: no move into itself, no circular hierarchies, no cross-workspace
  moves, parent must live in the same workspace
- deleting folders: subfolders cascade, documents are never deleted — they
  fall back to the workspace root with all content intact
- ownership and authentication enforcement on every folder endpoint
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


def create_folder(
    client, user, workspace_id: int, name: str, parent_id: int | None = None
) -> dict:
    payload = {"workspace_id": workspace_id, "name": name}
    if parent_id is not None:
        payload["parent_id"] = parent_id
    response = client.post(f"{BASE}/folders", json=payload, headers=user.headers)
    assert response.status_code == 201, response.text
    return response.json()


def create_document(client, user, workspace_id: int, title: str, folder_id=None):
    payload = {"workspace_id": workspace_id, "title": title}
    if folder_id is not None:
        payload["folder_id"] = folder_id
    response = client.post(f"{BASE}/documents", json=payload, headers=user.headers)
    assert response.status_code == 201, response.text
    return response.json()


def get_tree(client, user, workspace_id: int):
    return client.get(
        f"{BASE}/folders/tree",
        params={"workspace_id": workspace_id},
        headers=user.headers,
    )


def patch_folder(client, user, folder_id: int, payload: dict):
    return client.patch(
        f"{BASE}/folders/{folder_id}", json=payload, headers=user.headers
    )


def delete_folder(client, user, folder_id: int):
    return client.delete(f"{BASE}/folders/{folder_id}", headers=user.headers)


def names(nodes) -> list[str]:
    return [n["name"] for n in nodes]


# ------------------------------------------------------- CREATE (hierarchy)


def test_create_nested_folders(client, owner):
    workspace = create_workspace(client, owner, "Nested WS")
    suffix = unique_suffix()

    root = create_folder(client, owner, workspace["id"], f"Projects {suffix}")
    child = create_folder(
        client, owner, workspace["id"], f"Backend {suffix}", parent_id=root["id"]
    )
    grandchild = create_folder(
        client, owner, workspace["id"], f"API {suffix}", parent_id=child["id"]
    )

    assert root["parent_id"] is None
    assert child["parent_id"] == root["id"]
    assert grandchild["parent_id"] == child["id"]
    # All three stay in the workspace they were created in.
    for folder in (root, child, grandchild):
        assert folder["workspace_id"] == workspace["id"]


def test_same_name_allowed_under_different_parents(client, owner):
    workspace = create_workspace(client, owner, "Name Scope WS")
    suffix = unique_suffix()
    parent_one = create_folder(client, owner, workspace["id"], f"P1 {suffix}")
    parent_two = create_folder(client, owner, workspace["id"], f"P2 {suffix}")

    one = create_folder(
        client, owner, workspace["id"], f"Docs {suffix}", parent_id=parent_one["id"]
    )
    two = create_folder(
        client, owner, workspace["id"], f"Docs {suffix}", parent_id=parent_two["id"]
    )
    assert one["name"] == two["name"]

    # Same location, same name: rejected.
    duplicate = client.post(
        f"{BASE}/folders",
        json={"workspace_id": workspace["id"], "name": f"Docs {suffix}",
              "parent_id": parent_one["id"]},
        headers=owner.headers,
    )
    assert duplicate.status_code == 409, duplicate.text


# ---------------------------------------------------------------- TREE READ


def test_folder_tree_returns_full_hierarchy(client, owner):
    workspace = create_workspace(client, owner, "Tree WS")
    suffix = unique_suffix()

    alpha = create_folder(client, owner, workspace["id"], f"A {suffix}")
    beta = create_folder(client, owner, workspace["id"], f"B {suffix}")
    child = create_folder(
        client, owner, workspace["id"], f"A1 {suffix}", parent_id=alpha["id"]
    )
    grandchild = create_folder(
        client, owner, workspace["id"], f"A1a {suffix}", parent_id=child["id"]
    )

    response = get_tree(client, owner, workspace["id"])
    assert response.status_code == 200, response.text
    tree = response.json()

    assert tree["total"] == 4
    assert len(tree["items"]) == 2  # alpha, beta at the root
    roots = tree["items"]
    assert names(roots) == [f"A {suffix}", f"B {suffix}"]  # deterministic order
    assert all(n["parent_id"] is None for n in roots)

    alpha_node = roots[0]
    assert names(alpha_node["children"]) == [f"A1 {suffix}"]
    child_node = alpha_node["children"][0]
    assert child_node["id"] == child["id"]
    assert names(child_node["children"]) == [f"A1a {suffix}"]
    assert child_node["children"][0]["id"] == grandchild["id"]

    beta_node = roots[1]
    assert beta_node["children"] == []
    # Node fields mirror FolderResponse.
    assert alpha_node["id"] == alpha["id"]
    assert alpha_node["workspace_id"] == workspace["id"]
    assert alpha_node["created_at"] and alpha_node["updated_at"]


def test_folder_tree_of_empty_workspace(client, owner):
    workspace = create_workspace(client, owner, "Empty Tree WS")
    response = get_tree(client, owner, workspace["id"])
    assert response.status_code == 200, response.text
    assert response.json() == {"items": [], "total": 0}


def test_folder_tree_excludes_deleted_folders(client, owner):
    workspace = create_workspace(client, owner, "Tree Delete WS")
    suffix = unique_suffix()
    alpha = create_folder(client, owner, workspace["id"], f"A {suffix}")
    child = create_folder(
        client, owner, workspace["id"], f"A1 {suffix}", parent_id=alpha["id"]
    )
    delete_folder(client, owner, child["id"])

    tree = get_tree(client, owner, workspace["id"]).json()
    assert tree["total"] == 1
    assert names(tree["items"]) == [f"A {suffix}"]
    assert tree["items"][0]["children"] == []


# -------------------------------------------------------------- RENAME


def test_rename_folder(client, owner):
    workspace = create_workspace(client, owner, "Rename WS")
    suffix = unique_suffix()
    folder = create_folder(client, owner, workspace["id"], f"Old {suffix}")

    renamed = patch_folder(client, owner, folder["id"], {"name": f"New {suffix}"})
    assert renamed.status_code == 200, renamed.text
    body = renamed.json()
    assert body["name"] == f"New {suffix}"
    assert body["id"] == folder["id"]
    # Rename must not change the position in the hierarchy.
    assert body["parent_id"] == folder["parent_id"]

    tree = get_tree(client, owner, workspace["id"]).json()
    assert names(tree["items"]) == [f"New {suffix}"]


def test_rename_to_sibling_name_conflicts(client, owner):
    workspace = create_workspace(client, owner, "Rename Conflict WS")
    suffix = unique_suffix()
    create_folder(client, owner, workspace["id"], f"Taken {suffix}")
    other = create_folder(client, owner, workspace["id"], f"Free {suffix}")

    response = patch_folder(
        client, owner, other["id"], {"name": f"Taken {suffix}"}
    )
    assert response.status_code == 409, response.text
    # The rename did not happen: tree is unchanged (sorted by name).
    tree = get_tree(client, owner, workspace["id"]).json()
    assert names(tree["items"]) == [f"Free {suffix}", f"Taken {suffix}"]


def test_empty_folder_update_rejected(client, owner):
    workspace = create_workspace(client, owner, "Empty Folder Patch WS")
    folder = create_folder(client, owner, workspace["id"], "Stable")
    response = patch_folder(client, owner, folder["id"], {})
    assert response.status_code == 422, response.text


# --------------------------------------------------------------------- MOVE


def test_move_folder_between_parents(client, owner):
    workspace = create_workspace(client, owner, "Move WS")
    suffix = unique_suffix()
    source = create_folder(client, owner, workspace["id"], f"Source {suffix}")
    target = create_folder(client, owner, workspace["id"], f"Target {suffix}")
    child = create_folder(
        client, owner, workspace["id"], f"Child {suffix}", parent_id=source["id"]
    )

    moved = patch_folder(
        client, owner, child["id"], {"parent_id": target["id"]}
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["parent_id"] == target["id"]

    tree = get_tree(client, owner, workspace["id"]).json()
    target_node = next(n for n in tree["items"] if n["id"] == target["id"])
    assert names(target_node["children"]) == [f"Child {suffix}"]
    source_node = next(n for n in tree["items"] if n["id"] == source["id"])
    assert source_node["children"] == []


def test_move_folder_to_workspace_root(client, owner):
    workspace = create_workspace(client, owner, "Move Root WS")
    suffix = unique_suffix()
    parent = create_folder(client, owner, workspace["id"], f"Parent {suffix}")
    child = create_folder(
        client, owner, workspace["id"], f"Child {suffix}", parent_id=parent["id"]
    )

    moved = patch_folder(client, owner, child["id"], {"parent_id": None})
    assert moved.status_code == 200, moved.text
    assert moved.json()["parent_id"] is None

    tree = get_tree(client, owner, workspace["id"]).json()
    assert sorted(n["id"] for n in tree["items"]) == sorted([parent["id"], child["id"]])


def test_cannot_move_folder_into_itself(client, owner):
    workspace = create_workspace(client, owner, "Self Move WS")
    folder = create_folder(client, owner, workspace["id"], f"Self {unique_suffix()}")

    response = patch_folder(
        client, owner, folder["id"], {"parent_id": folder["id"]}
    )
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == "A folder cannot be its own parent"
    # Unchanged.
    assert (
        patch_folder(client, owner, folder["id"], {"name": "Still Root"})
        .json()["parent_id"]
        is None
    )


def test_cannot_move_folder_into_own_subtree(client, owner):
    """Circular hierarchies: A -> C and A -> grandchild are both rejected."""
    workspace = create_workspace(client, owner, "Cycle WS")
    suffix = unique_suffix()
    folder = create_folder(client, owner, workspace["id"], f"A {suffix}")
    child = create_folder(
        client, owner, workspace["id"], f"C {suffix}", parent_id=folder["id"]
    )
    grandchild = create_folder(
        client, owner, workspace["id"], f"G {suffix}", parent_id=child["id"]
    )

    direct = patch_folder(
        client, owner, folder["id"], {"parent_id": child["id"]}
    )
    assert direct.status_code == 409, direct.text
    assert direct.json()["detail"] == "Cannot move a folder into its own subtree"

    deeper = patch_folder(
        client, owner, folder["id"], {"parent_id": grandchild["id"]}
    )
    assert deeper.status_code == 409, deeper.text

    # Nothing changed: the tree is still A -> C -> G.
    tree = get_tree(client, owner, workspace["id"]).json()
    assert names(tree["items"]) == [f"A {suffix}"]
    node = tree["items"][0]
    assert names(node["children"]) == [f"C {suffix}"]
    assert names(node["children"][0]["children"]) == [f"G {suffix}"]


def test_cannot_move_folder_across_workspaces(client, owner):
    ws_one = create_workspace(client, owner, "Move Src WS")
    ws_two = create_workspace(client, owner, "Move Dst WS")
    suffix = unique_suffix()
    folder = create_folder(client, owner, ws_one["id"], f"Mine {suffix}")
    foreign = create_folder(client, owner, ws_two["id"], f"Theirs {suffix}")

    response = patch_folder(
        client, owner, folder["id"], {"parent_id": foreign["id"]}
    )
    assert response.status_code == 404, response.text
    assert response.json()["detail"] == "Parent folder not found"

    # Also rejected at creation time.
    created = client.post(
        f"{BASE}/folders",
        json={"workspace_id": ws_one["id"], "name": f"Cross {suffix}",
              "parent_id": foreign["id"]},
        headers=owner.headers,
    )
    assert created.status_code == 404, created.text

    # The folder is untouched: still a root in its own workspace.
    tree = get_tree(client, owner, ws_one["id"]).json()
    assert names(tree["items"]) == [f"Mine {suffix}"]


def test_move_with_unknown_parent_returns_404(client, owner):
    workspace = create_workspace(client, owner, "Bad Parent WS")
    folder = create_folder(client, owner, workspace["id"], "Orphan parent")

    response = patch_folder(
        client, owner, folder["id"], {"parent_id": 999_999}
    )
    assert response.status_code == 404, response.text
    assert response.json()["detail"] == "Parent folder not found"


# ------------------------------------------------------------------- DELETE


def test_delete_folder_moves_documents_to_root_and_never_deletes_them(
    client, owner
):
    workspace = create_workspace(client, owner, "Doc Safe WS")
    suffix = unique_suffix()
    parent = create_folder(client, owner, workspace["id"], f"Parent {suffix}")
    child = create_folder(
        client, owner, workspace["id"], f"Child {suffix}", parent_id=parent["id"]
    )
    in_parent = create_document(
        client, owner, workspace["id"], f"In parent {suffix}", folder_id=parent["id"]
    )
    in_child = create_document(
        client, owner, workspace["id"], f"In child {suffix}", folder_id=child["id"]
    )
    elsewhere = create_document(
        client, owner, workspace["id"], f"Elsewhere {suffix}"
    )
    tag = client.post(
        f"{BASE}/tags",
        json={"workspace_id": workspace["id"], "name": f"keep {suffix}",
              "color": "#00ff00"},
        headers=owner.headers,
    ).json()
    client.post(
        f"{BASE}/documents/{in_child['id']}/tags?tag_id={tag['id']}",
        headers=owner.headers,
    )

    deleted = delete_folder(client, owner, parent["id"])
    assert deleted.status_code == 204, deleted.text

    # The whole subtree is gone (folder + cascaded subfolder).
    assert patch_folder(
        client, owner, parent["id"], {"name": "zombie"}
    ).status_code == 404
    assert patch_folder(
        client, owner, child["id"], {"name": "zombie"}
    ).status_code == 404
    tree = get_tree(client, owner, workspace["id"]).json()
    assert tree == {"items": [], "total": 0}

    # Documents survived: same ids, same workspace, moved to the root.
    for document in (in_parent, in_child, elsewhere):
        detail = client.get(
            f"{BASE}/documents/{document['id']}", headers=owner.headers
        )
        assert detail.status_code == 200, detail.text
        body = detail.json()
        assert body["folder_id"] is None
        assert body["workspace_id"] == workspace["id"]
    assert client.get(
        f"{BASE}/documents/{in_child['id']}", headers=owner.headers
    ).json()["tags"] == [tag]

    active = client.get(
        f"{BASE}/documents",
        params={"workspace_id": workspace["id"]},
        headers=owner.headers,
    ).json()
    assert active["total"] == 3
    assert {i["id"] for i in active["items"]} == {
        in_parent["id"], in_child["id"], elsewhere["id"]
    }


def test_delete_subfolder_keeps_parent_and_its_documents(client, owner):
    workspace = create_workspace(client, owner, "Subtree Delete WS")
    suffix = unique_suffix()
    parent = create_folder(client, owner, workspace["id"], f"Parent {suffix}")
    child = create_folder(
        client, owner, workspace["id"], f"Child {suffix}", parent_id=parent["id"]
    )
    in_child = create_document(
        client, owner, workspace["id"], f"Child doc {suffix}", folder_id=child["id"]
    )
    in_parent = create_document(
        client, owner, workspace["id"], f"Parent doc {suffix}", folder_id=parent["id"]
    )

    deleted = delete_folder(client, owner, child["id"])
    assert deleted.status_code == 204, deleted.text

    # Parent folder and its own document are untouched.
    assert (
        client.get(
            f"{BASE}/documents/{in_parent['id']}", headers=owner.headers
        ).json()["folder_id"]
        == parent["id"]
    )
    tree = get_tree(client, owner, workspace["id"]).json()
    assert tree["total"] == 1
    parent_node = tree["items"][0]
    assert parent_node["id"] == parent["id"]
    assert parent_node["children"] == []

    # The deleted subfolder's document fell back to the root.
    assert (
        client.get(
            f"{BASE}/documents/{in_child['id']}", headers=owner.headers
        ).json()["folder_id"]
        is None
    )


def test_delete_unknown_folder_returns_404(client, owner):
    response = delete_folder(client, owner, 999_999)
    assert response.status_code == 404, response.text
    assert response.json()["detail"] == "Folder not found"


# ------------------------------------------------- OWNERSHIP / AUTH SECURITY


def test_folder_operations_require_workspace_ownership(client, owner, stranger):
    owner_ws = create_workspace(client, owner, "Owner Folders")
    suffix = unique_suffix()
    folder = create_folder(client, owner, owner_ws["id"], f"Private {suffix}")

    # Stranger cannot create folders in someone else's workspace.
    created = client.post(
        f"{BASE}/folders",
        json={"workspace_id": owner_ws["id"], "name": "intruder"},
        headers=stranger.headers,
    )
    assert created.status_code == 404, created.text

    # Nor rename, move, or delete the owner's folder: hidden as 404.
    assert patch_folder(
        client, stranger, folder["id"], {"name": "stolen"}
    ).status_code == 404
    assert patch_folder(
        client, stranger, folder["id"], {"parent_id": None}
    ).status_code == 404
    assert delete_folder(client, stranger, folder["id"]).status_code == 404

    # Nor read the owner's hierarchy (tree or flat list).
    assert get_tree(client, stranger, owner_ws["id"]).status_code == 404
    listed = client.get(
        f"{BASE}/folders",
        params={"workspace_id": owner_ws["id"]},
        headers=stranger.headers,
    )
    assert listed.status_code == 404, listed.text

    # The stranger's own workspace still works normally.
    stranger_ws = create_workspace(client, stranger, "Stranger Folders")
    own = create_folder(client, stranger, stranger_ws["id"], f"Own {suffix}")
    assert get_tree(client, stranger, stranger_ws["id"]).json()["total"] == 1
    assert own["parent_id"] is None


def test_folder_endpoints_require_authentication(client, owner):
    workspace = create_workspace(client, owner, "Auth Folders")
    folder = create_folder(client, owner, workspace["id"], "Auth folder")

    for method, path, kwargs in (
        (client.post, f"{BASE}/folders", {"json": {"workspace_id": workspace["id"], "name": "x"}}),
        (client.get, f"{BASE}/folders/tree", {"params": {"workspace_id": workspace["id"]}}),
        (client.patch, f"{BASE}/folders/{folder['id']}", {"json": {"name": "x"}}),
        (client.delete, f"{BASE}/folders/{folder['id']}", {}),
    ):
        response = method(path, **kwargs)  # no Authorization header
        assert response.status_code == 401, f"{path}: {response.text}"
        assert response.json()["detail"] == "Not authenticated"
