from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Workspace


def get(db: Session, workspace_id: int) -> Workspace | None:
    return db.scalars(select(Workspace).where(Workspace.id == workspace_id)).first()


def list_owned(
    db: Session, owner_id: int, *, limit: int, offset: int
) -> tuple[list[Workspace], int]:
    condition = Workspace.owner_id == owner_id
    total = int(
        db.scalar(select(func.count()).select_from(Workspace).where(condition)) or 0
    )
    stmt = (
        select(Workspace)
        .where(condition)
        .order_by(Workspace.updated_at.desc(), Workspace.id.desc())
        .limit(limit)
        .offset(offset)
    )
    items = list(db.scalars(stmt).all())
    return items, total


def create(
    db: Session, *, owner_id: int, name: str, description: str | None
) -> Workspace:
    workspace = Workspace(owner_id=owner_id, name=name, description=description)
    db.add(workspace)
    return workspace


def delete(db: Session, workspace: Workspace) -> None:
    db.delete(workspace)
