from __future__ import annotations

from sqlalchemy import func, literal, select, union
from sqlalchemy.orm import Session

from ..docs.models import SHARED_WORKSPACE, Workspace
from .models import (
    DocumentWorkspace,
    EventWorkspace,
    TaskWorkspace,
    WorkspaceInvitation,
    WorkspaceMember,
)


def get_workspace(db: Session, workspace_id: int) -> Workspace | None:
    return db.get(Workspace, workspace_id)


def get_personal_workspace_for_user(db: Session, user_id: int) -> Workspace | None:
    stmt = select(Workspace).where(
        Workspace.owner_id == user_id,
        Workspace.workspace_type == "personal",
    )
    return db.scalars(stmt).first()


def list_accessible_workspaces(
    db: Session, user_id: int, *, limit: int = 50, offset: int = 0
) -> tuple[list[tuple[Workspace, str]], int]:
    owned = select(
        Workspace.id.label("workspace_id"),
        literal("owner").label("user_role"),
    ).where(Workspace.owner_id == user_id)

    member = (
        select(
            WorkspaceMember.workspace_id.label("workspace_id"),
            WorkspaceMember.role.label("user_role"),
        )
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(
            WorkspaceMember.user_id == user_id,
            Workspace.workspace_type == SHARED_WORKSPACE,
            Workspace.owner_id != user_id,
        )
    )

    accessible = owned.union(member).subquery()
    stmt = (
        select(Workspace, accessible.c.user_role)
        .join(accessible, accessible.c.workspace_id == Workspace.id)
    )

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = (
        stmt.order_by(Workspace.workspace_type.asc(), Workspace.updated_at.desc(), Workspace.id.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = db.execute(stmt).all()
    return [(row[0], row[1]) for row in rows], int(total or 0)


def create_workspace(db: Session, **fields) -> Workspace:
    ws = Workspace(**fields)
    db.add(ws)
    db.flush()
    return ws


def delete_workspace(db: Session, workspace: Workspace) -> None:
    db.delete(workspace)


def get_member(db: Session, workspace_id: int, user_id: int) -> WorkspaceMember | None:
    stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    )
    return db.scalars(stmt).first()


def get_member_by_id(db: Session, workspace_id: int, member_id: int) -> WorkspaceMember | None:
    stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.id == member_id,
    )
    return db.scalars(stmt).first()


def list_members(db: Session, workspace_id: int) -> list[WorkspaceMember]:
    stmt = (
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.joined_at.asc(), WorkspaceMember.id.asc())
    )
    return list(db.scalars(stmt).all())


def create_member(db: Session, **fields) -> WorkspaceMember:
    member = WorkspaceMember(**fields)
    db.add(member)
    db.flush()
    return member


def delete_member(db: Session, member: WorkspaceMember) -> None:
    db.delete(member)


def count_accessible(db: Session, user_id: int) -> int:
    _, total = list_accessible_workspaces(db, user_id, limit=1, offset=0)
    return total


# --- Invitations ---


def create_invitation(db: Session, **fields) -> WorkspaceInvitation:
    inv = WorkspaceInvitation(**fields)
    db.add(inv)
    db.flush()
    return inv


def get_invitation(db: Session, invitation_id: int) -> WorkspaceInvitation | None:
    return db.get(WorkspaceInvitation, invitation_id)


def get_invitation_for_workspace(
    db: Session, workspace_id: int, invitation_id: int
) -> WorkspaceInvitation | None:
    stmt = select(WorkspaceInvitation).where(
        WorkspaceInvitation.workspace_id == workspace_id,
        WorkspaceInvitation.id == invitation_id,
    )
    return db.scalars(stmt).first()


def get_pending_invitation_for_user(
    db: Session, workspace_id: int, invitee_id: int
) -> WorkspaceInvitation | None:
    stmt = select(WorkspaceInvitation).where(
        WorkspaceInvitation.workspace_id == workspace_id,
        WorkspaceInvitation.invitee_id == invitee_id,
        WorkspaceInvitation.status == "pending",
    )
    return db.scalars(stmt).first()


def list_workspace_invitations(db: Session, workspace_id: int) -> list[WorkspaceInvitation]:
    stmt = (
        select(WorkspaceInvitation)
        .where(WorkspaceInvitation.workspace_id == workspace_id)
        .order_by(WorkspaceInvitation.created_at.desc(), WorkspaceInvitation.id.desc())
    )
    return list(db.scalars(stmt).all())


def list_received_invitations(db: Session, invitee_id: int) -> list[WorkspaceInvitation]:
    stmt = (
        select(WorkspaceInvitation)
        .where(WorkspaceInvitation.invitee_id == invitee_id)
        .order_by(WorkspaceInvitation.created_at.desc(), WorkspaceInvitation.id.desc())
    )
    return list(db.scalars(stmt).all())


# --- Resource workspace associations ---


def _assoc_model(resource_type: str):
    return {
        "task": TaskWorkspace,
        "document": DocumentWorkspace,
        "event": EventWorkspace,
    }[resource_type]


def _assoc_resource_field(resource_type: str) -> str:
    return {"task": "task_id", "document": "document_id", "event": "event_id"}[resource_type]


def get_resource_workspace_ids(db: Session, resource_type: str, resource_id: int) -> list[int]:
    model = _assoc_model(resource_type)
    field = getattr(model, _assoc_resource_field(resource_type))
    return list(db.scalars(select(model.workspace_id).where(field == resource_id)).all())


def list_resource_workspace_ids_batch(
    db: Session, resource_type: str, resource_ids: list[int]
) -> dict[int, list[int]]:
    """Return raw association workspace ids for many resources in one query."""
    if not resource_ids:
        return {}
    model = _assoc_model(resource_type)
    field = getattr(model, _assoc_resource_field(resource_type))
    rows = db.execute(
        select(field, model.workspace_id).where(field.in_(resource_ids))
    ).all()
    out: dict[int, list[int]] = {rid: [] for rid in resource_ids}
    for resource_id, workspace_id in rows:
        out.setdefault(resource_id, []).append(workspace_id)
    return out


def has_resource_workspace(db: Session, resource_type: str, resource_id: int, workspace_id: int) -> bool:
    model = _assoc_model(resource_type)
    rfield = getattr(model, _assoc_resource_field(resource_type))
    stmt = select(model).where(rfield == resource_id, model.workspace_id == workspace_id)
    return db.scalars(stmt).first() is not None


def add_resource_workspace(db: Session, resource_type: str, resource_id: int, workspace_id: int):
    model = _assoc_model(resource_type)
    rfield = _assoc_resource_field(resource_type)
    kwargs = {rfield: resource_id, "workspace_id": workspace_id}
    obj = model(**kwargs)
    db.add(obj)
    db.flush()
    return obj


def remove_resource_workspace(db: Session, resource_type: str, resource_id: int, workspace_id: int) -> bool:
    model = _assoc_model(resource_type)
    rfield = getattr(model, _assoc_resource_field(resource_type))
    stmt = select(model).where(rfield == resource_id, model.workspace_id == workspace_id)
    obj = db.scalars(stmt).first()
    if obj is None:
        return False
    db.delete(obj)
    db.flush()
    return True


def count_resource_workspaces(db: Session, resource_type: str, resource_id: int) -> int:
    model = _assoc_model(resource_type)
    rfield = getattr(model, _assoc_resource_field(resource_type))
    stmt = select(func.count()).select_from(model).where(rfield == resource_id)
    return int(db.scalar(stmt) or 0)


def list_resource_workspace_ids(db: Session, resource_type: str, resource_id: int) -> list[int]:
    return get_resource_workspace_ids(db, resource_type, resource_id)


def list_accessible_workspace_ids(db: Session, user_id: int) -> set[int]:
    rows, _total = list_accessible_workspaces(db, user_id, limit=10000, offset=0)
    return {w.id for w, _role in rows}


def list_resource_workspaces_for_actor(
    db: Session, resource_type: str, resource_ids: list[int], actor_id: int
) -> dict[int, list[dict]]:
    if not resource_ids:
        return {}
    model = _assoc_model(resource_type)
    rfield = getattr(model, _assoc_resource_field(resource_type))
    accessible_ids = list_accessible_workspace_ids(db, actor_id)
    if not accessible_ids:
        return {rid: [] for rid in resource_ids}
    stmt = (
        select(rfield.label("resource_id"), Workspace.id, Workspace.name, Workspace.workspace_type)
        .join(Workspace, Workspace.id == model.workspace_id)
        .where(rfield.in_(resource_ids), model.workspace_id.in_(accessible_ids))
        .order_by(Workspace.workspace_type.asc(), Workspace.name.asc(), Workspace.id.asc())
    )
    rows = db.execute(stmt).all()
    out: dict[int, list[dict]] = {rid: [] for rid in resource_ids}
    for resource_id, ws_id, name, ws_type in rows:
        out.setdefault(resource_id, []).append(
            {"id": ws_id, "name": name, "workspace_type": ws_type}
        )
    return out
