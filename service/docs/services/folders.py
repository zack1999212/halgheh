from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...auth.models import User
from ..models import Folder
from ..repositories import folders as folder_repository
from ..schemas import FolderCreate, FolderUpdate
from . import access


def _name_conflict() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="A folder with this name already exists in this location",
    )


def create_folder(db: Session, user: User, data: FolderCreate) -> Folder:
    # Structural objects belong to the workspace owner only.
    access.owned_workspace(db, user, data.workspace_id)
    if data.parent_id is not None:
        parent = folder_repository.get_in_workspace(
            db, data.parent_id, data.workspace_id
        )
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parent folder not found",
            )
    folder = folder_repository.create(
        db,
        workspace_id=data.workspace_id,
        parent_id=data.parent_id,
        name=data.name,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _name_conflict()
    except Exception:
        db.rollback()
        raise
    db.refresh(folder)
    return folder


def update_folder(db: Session, folder: Folder, data: FolderUpdate) -> Folder:
    updates = data.model_dump(exclude_unset=True)
    if "parent_id" in updates:
        new_parent_id = updates.pop("parent_id")
        if new_parent_id is not None:
            parent = folder_repository.get_in_workspace(
                db, new_parent_id, folder.workspace_id
            )
            if parent is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Parent folder not found",
                )
            if parent.id == folder.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A folder cannot be its own parent",
                )
            # Walk the ancestor chain: moving a folder under its own
            # descendant would detach it from the tree.
            cursor = parent
            while cursor is not None:
                if cursor.id == folder.id:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Cannot move a folder into its own subtree",
                    )
                cursor = (
                    folder_repository.get_in_workspace(
                        db, cursor.parent_id, folder.workspace_id
                    )
                    if cursor.parent_id is not None
                    else None
                )
        folder.parent_id = new_parent_id
    if "name" in updates:
        folder.name = updates["name"]
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _name_conflict()
    except Exception:
        db.rollback()
        raise
    db.refresh(folder)
    return folder


def delete_folder(db: Session, folder: Folder) -> None:
    """Hard delete with a document-safe strategy.

    - The folder and its whole subtree are removed (folders.parent_id is
      CASCADE), including any nested folders.
    - Documents are never deleted: documents.folder_id is SET NULL, so
      every document that lived in the folder or its subfolders falls
      back to the workspace root with content, versions, tags and
      permissions intact.
    """
    folder_repository.delete(db, folder)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def list_folders(
    db: Session, user: User, workspace_id: int, *, limit: int, offset: int
) -> tuple[list[Folder], int]:
    access.owned_workspace(db, user, workspace_id)
    return folder_repository.list_in_workspace(
        db, workspace_id, limit=limit, offset=offset
    )


def get_folder_tree(
    db: Session, user: User, workspace_id: int
) -> tuple[list[dict], int]:
    """Workspace folder hierarchy as nested dict nodes matching FolderNode.

    Deletion strategies guarantee invariants this relies on: a folder's
    parent always exists in the same workspace, so every node attaches
    either to its parent or to the root list.
    """
    access.owned_workspace(db, user, workspace_id)
    folders = folder_repository.list_all_in_workspace(db, workspace_id)
    nodes = {
        folder.id: {
            "id": folder.id,
            "workspace_id": folder.workspace_id,
            "parent_id": folder.parent_id,
            "name": folder.name,
            "created_at": folder.created_at,
            "updated_at": folder.updated_at,
            "children": [],
        }
        for folder in folders
    }
    roots: list[dict] = []
    for folder in folders:
        node = nodes[folder.id]
        parent = nodes.get(folder.parent_id) if folder.parent_id else None
        (parent["children"] if parent is not None else roots).append(node)
    return roots, len(folders)
