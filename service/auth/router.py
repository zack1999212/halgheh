from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..calendar.service import create_default_calendar
from ..core.database import get_db
from .dependencies import get_current_user
from .models import User
from .schemas import UserCreate, UserLogin, UserOut
from .security import create_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


# --- CRUD ---


def create_user(db: Session, data: UserCreate) -> User:
    if db.scalar(select(User).where(User.username == data.username)):
        raise HTTPException(status_code=400, detail="Username already taken")
    user = User(
        username=data.username,
        name=data.name,
        hashed_password=hash_password(data.password),
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
