"""Authorization predicates for the project module.

Centralized so project access, membership, and role checks remain consistent
and extensible.
"""

from __future__ import annotations

from .models import Project

ROLE_OWNER = "owner"
ROLE_ADMIN = "admin"
ROLE_EDITOR = "editor"
ROLE_VIEWER = "viewer"
ROLE_NONE = "none"

PROJECT_ROLES = (ROLE_OWNER, ROLE_ADMIN, ROLE_EDITOR, ROLE_VIEWER)
MANAGEABLE_MEMBER_ROLES = (ROLE_ADMIN, ROLE_EDITOR, ROLE_VIEWER)


def project_role(
    project: Project | None, user_id: int, member_role: str | None = None
) -> str:
    """Classify the caller's relationship to a project.

    ``member_role`` is the accepted ProjectMember role for the user, if any.
    Pending invitees have no accepted membership and therefore no access role.
    """
    if project is None:
        return ROLE_NONE
    if project.owner_id == user_id:
        return ROLE_OWNER
    if member_role in MANAGEABLE_MEMBER_ROLES:
        return member_role
    return ROLE_NONE


def can_view(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_ADMIN, ROLE_EDITOR, ROLE_VIEWER)


def can_edit_project_settings(role: str) -> bool:
    """Edit project details/settings."""
    return role in (ROLE_OWNER, ROLE_ADMIN)


def can_manage_project_content(role: str) -> bool:
    """Create/edit project content (used by future project-scoped resources)."""
    return role in (ROLE_OWNER, ROLE_ADMIN, ROLE_EDITOR)


def can_manage_invitations(role: str) -> bool:
    return role == ROLE_OWNER


def can_manage_members(role: str) -> bool:
    return role == ROLE_OWNER


def can_archive_or_delete(role: str) -> bool:
    return role == ROLE_OWNER
