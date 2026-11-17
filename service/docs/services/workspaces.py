from sqlalchemy.orm import Session

from ...auth.models import User
from ..models import Workspace
from ..repositories import workspaces as workspace_repository
from ..schemas import WorkspaceCreate, WorkspaceUpdate
from . import access

def create_workspace(
    db: Session, user: User, data: WorkspaceCreate
) -> Workspace:
    workspace = workspace_repository.create(
        db,
        owner_id=user.id,  # never trusted from the client
        name=data.name,
        description=data.description,
    )
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(workspace)
    return workspace


def list_workspaces(
    db: Session, user: User, *, limit: int, offset: int
) -> tuple[list[Workspace], int]:
    return workspace_repository.list_owned(db, user.id, limit=limit, offset=offset)


def update_workspace(
    db: Session, workspace: Workspace, data: WorkspaceUpdate
) -> Workspace:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(workspace, field, value)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(workspace)
    return workspace


def delete_workspace(db: Session, workspace: Workspace) -> None:
    """Hard delete: cascades to folders, documents, tags (see models).

    Trash/restore flows use documents.is_deleted instead; this is the
    explicit "destroy the workspace" operation.
    """
    workspace_repository.delete(db, workspace)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
