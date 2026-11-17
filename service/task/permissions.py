"""Authorization predicates for the task module.

Pure functions, no database access and no HTTP concepts — the service layer
calls these after loading a task. Centralized here so that when a
team/workspace/manager structure is eventually introduced elsewhere in the
platform, only this file (plus repository scoping) changes.

Role model (v1, platform reality):

* The platform has NO teams, roles, or manager/subordinate data
  (verified in Phase 1), so the role of a user relative to a task is one of:
  * ``owner``    — created the task; full control.
  * ``assignee`` — has an active assignment; may change status, comment,
                   and view; may not restructure or delete the task.
  * ``none``     — no relationship; the service layer answers 404, exactly
                   like every other module treats unowned resources.

Error philosophy (house rules):

* Invisible or nonexistent resources -> 404 (identical response for both,
  so guessed ids reveal nothing).
* Visible-but-insufficient permission -> 403 (the caller can legitimately
  see the task, so a 404 would be confusing and untruthful).
"""

from __future__ import annotations

from .models import Task

ROLE_OWNER = "owner"
ROLE_ASSIGNEE = "assignee"
ROLE_NONE = "none"


def task_role(task: Task | None, user_id: int) -> str:
    """Classify the caller's relationship to a task."""
    if task is None:
        return ROLE_NONE
    if task.created_by == user_id:
        return ROLE_OWNER
    for assignment in task.assignments:
        if (
            assignment.assigned_user_id == user_id
            and assignment.assignment_status == "active"
        ):
            return ROLE_ASSIGNEE
    return ROLE_NONE


def can_view(role: str) -> bool:
    return role != ROLE_NONE


def can_edit(role: str) -> bool:
    """Title/description/dates/parent/labels/deletion/assignment control."""
    return role == ROLE_OWNER


def can_change_status(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_ASSIGNEE)


def can_comment(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_ASSIGNEE)


def can_assign(role: str) -> bool:
    """Who may create, reassign, or remove assignments.

    v1: only the task owner delegates work. When the platform gains a
    team/manager model, this becomes a membership check
    ("assigner must be authorized to manage ``target_user_id``") without any
    other module change — the service layer and schemas already treat this
    as the single decision point.
    """
    return role == ROLE_OWNER
