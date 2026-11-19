import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..calendar.service import create_default_calendar
from ..core.database import get_db
from .dependencies import get_current_user
from .models import User
from .schemas import PasswordChange, UserCreate, UserLogin, UserOut, UserProfileUpdate
from .security import create_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

UPLOAD_ROOT = Path(__file__).resolve().parents[1] / "uploads"
AVATAR_DIR = UPLOAD_ROOT / "avatars"
ALLOWED_AVATAR_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_AVATAR_BYTES = 5 * 1024 * 1024


# --- CRUD ---


def create_user(db: Session, data: UserCreate) -> User:
    if db.scalar(select(User).where(User.username == data.username)):
        raise HTTPException(status_code=400, detail="Username already taken")
    user = User(
        username=data.username,
        name=data.name,
        hashed_password=hash_password(data.password),
        avatar_url=None,
    )
    db.add(user)
    try:
        db.flush()
        create_default_calendar(db, user.id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Username already taken")
    db.refresh(user)
    return user


def get_user_by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username))


def list_users(db: Session) -> list[User]:
    return list(db.scalars(select(User)))


def delete_user(db: Session, user_id: int) -> bool:
    user = db.get(User, user_id)
    if not user:
        return False
    db.delete(user)
    db.commit()
    return True


def _remove_local_avatar(avatar_url: str | None) -> None:
    if not avatar_url or not avatar_url.startswith("/uploads/avatars/"):
        return
    filename = avatar_url.rsplit("/", 1)[-1]
    if not filename:
        return
    path = AVATAR_DIR / filename
    try:
        if path.exists() and path.is_file():
            path.unlink()
    except OSError:
        # Best-effort cleanup; profile update should not fail because an old file
        # could not be removed.
        pass


# --- Routes ---


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    return create_user(db, data)


@router.post("/login")
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = get_user_by_username(db, data.username)
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"access_token": create_token(user.id), "token_type": "bearer"}


@router.get("/users", response_model=list[UserOut])
def users(
    current_user: User = Depends(get_current_user),
):
    # Prevent user enumeration: an ordinary authenticated user may only see
    # their own account. No admin/list-all capability is provided.
    return [current_user]


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(
    data: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No profile changes provided")

    if "username" in updates and updates["username"] is not None:
        new_username = updates["username"].strip()
        if not new_username:
            raise HTTPException(status_code=400, detail="Username cannot be empty")
        if new_username != current_user.username:
            existing = db.scalar(select(User).where(User.username == new_username))
            if existing and existing.id != current_user.id:
                raise HTTPException(status_code=400, detail="Username already taken")
            current_user.username = new_username
    elif "username" in updates and updates["username"] is None:
        raise HTTPException(status_code=400, detail="Username cannot be null")

    if "name" in updates and updates["name"] is not None:
        current_user.name = updates["name"].strip()
    elif "name" in updates and updates["name"] is None:
        # Keep name non-null in DB; treat explicit null as empty.
        current_user.name = ""

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Username already taken")
    db.refresh(current_user)
    return current_user


@router.post("/me/password")
def change_password(
    data: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if not data.new_password.strip():
        raise HTTPException(status_code=400, detail="New password cannot be empty")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different")

    current_user.hashed_password = hash_password(data.new_password)
    db.commit()
    return {"ok": True}


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content_type = (file.content_type or "").lower().strip()
    ext = ALLOWED_AVATAR_TYPES.get(content_type)
    if ext is None:
        # Fallback to filename extension for some clients.
        suffix = Path(file.filename or "").suffix.lower()
        allowed_exts = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
        if suffix == ".jpeg":
            suffix = ".jpg"
        if suffix not in allowed_exts:
            raise HTTPException(status_code=400, detail="Unsupported image type. Use JPG, PNG, WEBP, or GIF.")
        ext = suffix

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded")
    if len(contents) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="Profile picture is too large (max 5 MB)")

    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"user-{current_user.id}-{uuid.uuid4().hex}{ext}"
    path = AVATAR_DIR / filename
    path.write_bytes(contents)

    old_avatar = current_user.avatar_url
    current_user.avatar_url = f"/uploads/avatars/{filename}"
    try:
        db.commit()
    except Exception:
        db.rollback()
        try:
            if path.exists():
                path.unlink()
        except OSError:
            pass
        raise
    db.refresh(current_user)
    _remove_local_avatar(old_avatar)
    return current_user


@router.delete("/users/{user_id}")
def users_delete(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id != current_user.id:
        raise HTTPException(status_code=404, detail="User not found")
    if not delete_user(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}
