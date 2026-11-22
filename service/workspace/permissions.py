"""Authorization predicates for the unified workspace foundation.

Workspace roles follow the project membership semantics:
- owner: implicit via workspaces.owner_id
- admin/editor/viewer: accepted WorkspaceMember role for shared workspaces

Personal workspaces are accessible only to their owner.
"""

from __future__ import annotations

from ..docs.models import PERSONAL_WORKSPACE, Workspace

ROLE_OWNER = "owner"
ROLE_ADMIN = "admin"
ROLE_EDITOR = "editor"
ROLE_VIEWER = "viewer"
ROLE_NONE = "none"

WORKSPACE_ROLES = (ROLE_OWNER, ROLE_ADMIN, ROLE_EDITOR, ROLE_VIEWER)
MANAGEABLE_MEMBER_ROLES = (ROLE_ADMIN, ROLE_EDITOR, ROLE_VIEWER)


def workspace_role(
    workspace: Workspace | None, user_id: int, member_role: str | None = None
) -> str:
    if workspace is None:
        return ROLE_NONE
    if workspace.owner_id == user_id:
        return ROLE_OWNER
    if workspace.workspace_type == PERSONAL_WORKSPACE:
        return ROLE_NONE
    if member_role in MANAGEABLE_MEMBER_ROLES:
        return member_role
    return ROLE_NONE


def can_view(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_ADMIN, ROLE_EDITOR, ROLE_VIEWER)


def can_edit_workspace(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_ADMIN)


def can_manage_content(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_ADMIN, ROLE_EDITOR)


def can_create_resource(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_ADMIN, ROLE_EDITOR)


def can_edit_resource(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_ADMIN, ROLE_EDITOR)


def can_detach_resource(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_ADMIN, ROLE_EDITOR)


def can_invite(role: str) -> bool:
    return role == ROLE_OWNER


def can_manage_members(role: str) -> bool:
    return role == ROLE_OWNER


def can_delete_workspace(role: str) -> bool:
    return role == ROLE_OWNER
