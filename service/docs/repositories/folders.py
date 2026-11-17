from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Folder


def get(db: Session, folder_id: int) -> Folder | None:
    return db.scalars(select(Folder).where(Folder.id == folder_id)).first()


def get_in_workspace(
    db: Session, folder_id: int, workspace_id: int
) -> Folder | None:
    stmt = select(Folder).where(
        Folder.id == folder_id, Folder.workspace_id == workspace_id
    )
    return db.scalars(stmt).first()


def list_in_workspace(
    db: Session, workspace_id: int, *, limit: int, offset: int
) -> tuple[list[Folder], int]:
    condition = Folder.workspace_id == workspace_id
    total = int(
        db.scalar(select(func.count()).select_from(Folder).where(condition)) or 0
    )
    stmt = (
        select(Folder)
        .where(condition)
        .order_by(Folder.name.asc(), Folder.id.asc())
        .limit(limit)
        .offset(offset)
    )
    items = list(db.scalars(stmt).all())
    return items, total


def list_all_in_workspace(db: Session, workspace_id: int) -> list[Folder]:
    """Every folder in the workspace, ordered for deterministic trees."""
    stmt = (
        select(Folder)
        .where(Folder.workspace_id == workspace_id)
        .order_by(Folder.name.asc(), Folder.id.asc())
    )
    return list(db.scalars(stmt).all())


def create(
    db: Session, *, workspace_id: int, parent_id: int | None, name: str
) -> Folder:
    folder = Folder(workspace_id=workspace_id, parent_id=parent_id, name=name)
    db.add(folder)
    return folder


def delete(db: Session, folder: Folder) -> None:
    db.delete(folder)
