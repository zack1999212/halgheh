from __future__ import annotations

import io
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..calendar.service import create_default_calendar
from ..core.database import get_db
from ..workspace.service import ensure_personal_workspace
from . import email as auth_email
from .dependencies import (
    ACCESS_COOKIE,
    CSRF_COOKIE,
    REFRESH_COOKIE,
    get_current_user,
    verify_csrf,
)
from .models import AuthToken, User
from .schemas import (
    DeleteAccountRequest,
    EmailVerifyConfirm,
    LogoutRequest,
    MessageResponse,
    PasswordChange,
    PasswordResetConfirm,
    PasswordResetRequest,
    SessionResponse,
    UserCreate,
    UserLogin,
    UserOut,
    UserProfileUpdate,
)
from .security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    IS_PRODUCTION,
    REFRESH_TOKEN_EXPIRE_DAYS,
    RESET_TOKEN_EXPIRE_HOURS,
    VERIFY_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_opaque_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    normalize_email,
    normalize_username,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

UPLOAD_ROOT = Path(__file__).resolve().parents[1] / "uploads"
AVATAR_DIR = UPLOAD_ROOT / "avatars"
MAX_AVATAR_BYTES = 5 * 1024 * 1024
MAX_AVATAR_DIMENSION = 512
COOKIE_SECURE = IS_PRODUCTION
# Used to keep failed logins comparable in cost to successful ones.
DUMMY_HASH = hash_password("timing-equalization-password")


# --- Cookie / session helpers ---


def _set_cookies(response, access: str, refresh: str, csrf: str) -> None:
    response.set_cookie(
        ACCESS_COOKIE, access, httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/"
    )
    response.set_cookie(
        REFRESH_COOKIE, refresh, httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/"
    )
    response.set_cookie(
        CSRF_COOKIE, csrf, httponly=False, secure=COOKIE_SECURE, samesite="lax", path="/"
    )


def _clear_cookies(response) -> None:
    for key in (ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE):
        response.delete_cookie(key, path="/")


def _issue_session(db: Session, user: User) -> tuple[JSONResponse, SessionResponse]:
    csrf = secrets.token_urlsafe(32)
    access = create_access_token(user.id, user.token_version)
    refresh = create_refresh_token(user.id, user.token_version)
    db.add(
        AuthToken(
            user_id=user.id,
            token_hash=hash_token(refresh),
            type=AuthToken.TOKEN_REFRESH,
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    db.commit()
    response = JSONResponse(
        content={
            "csrf_token": csrf,
            "user": UserOut.model_validate(user).model_dump(mode="json"),
            "access_token_expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "refresh_token_expires_in": REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        }
    )
    _set_cookies(response, access, refresh, csrf)
    return response, SessionResponse(
        csrf_token=csrf,
        user=UserOut.model_validate(user),
    )


def _issue_one_time_token(db: Session, user: User, token_type: str, hours: int) -> str:
    raw = create_opaque_token()
    db.add(
        AuthToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            type=token_type,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=hours),
        )
    )
    db.commit()
    return raw


def _consume_token(db: Session, raw: str, token_type: str) -> tuple[User, AuthToken]:
    record = db.scalar(
        select(AuthToken).where(
            AuthToken.token_hash == hash_token(raw),
            AuthToken.type == token_type,
            AuthToken.used_at.is_(None),
        )
    )
    if record is None or record.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    user = db.get(User, record.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    record.used_at = datetime.now(timezone.utc)
    return user, record


def _revoke_tokens(db: Session, user_id: int) -> None:
    db.execute(
        update(AuthToken)
        .where(AuthToken.user_id == user_id, AuthToken.used_at.is_(None))
        .values(used_at=datetime.now(timezone.utc))
    )
    db.flush()


# --- CRUD ---


def create_user(db: Session, data: UserCreate) -> User:
    if db.scalar(select(User).where(User.username == data.username)):
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.scalar(select(User).where(User.email == data.email)):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        username=data.username,
        email=data.email,
        name=data.name,
        hashed_password=hash_password(data.password),
        avatar_url=None,
    )
    db.add(user)
    try:
        db.flush()
        create_default_calendar(db, user.id)
        ensure_personal_workspace(db, user)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Username already taken")
    db.refresh(user)
    return user


def get_user_by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == normalize_username(username)))


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
        pass


# --- Routes ---


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    # Always the same response: registration must not reveal whether a
    # username or email is already in use.
    try:
        user = create_user(db, data)
    except HTTPException as exc:
        if exc.status_code != status.HTTP_400_BAD_REQUEST:
            raise
        return MessageResponse(
            message="If these details are available, check your email to verify your account."
        )
    token = _issue_one_time_token(
        db, user, AuthToken.TOKEN_VERIFY, VERIFY_TOKEN_EXPIRE_DAYS * 24
    )
    auth_email.verification_email(user.email, token)
    return MessageResponse(
        message="If these details are available, check your email to verify your account."
    )


@router.post("/login")
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = get_user_by_username(db, data.username)
    if not user or not verify_password(data.password, user.hashed_password):
        # Generic message prevents username enumeration and timing leaks are
        # avoided by always verifying against a real bcrypt hash.
        verify_password(data.password, DUMMY_HASH)
        raise HTTPException(status_code=401, detail="Invalid username or password")
    response, _payload = _issue_session(db, user)
    return response


@router.post("/refresh")
def refresh(request: Request, db: Session = Depends(get_db)):
    verify_csrf(request)
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(raw, "refresh")
    if payload is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.get(User, payload["user_id"])
    if user is None or payload["token_version"] != user.token_version:
        raise HTTPException(status_code=401, detail="Not authenticated")

    old = db.scalar(
        select(AuthToken).where(
            AuthToken.token_hash == hash_token(raw),
            AuthToken.type == AuthToken.TOKEN_REFRESH,
            AuthToken.used_at.is_(None),
        )
    )
    if old is None or old.expires_at <= datetime.now(timezone.utc):
        # Reuse of a rotated token invalidates the whole family.
        _revoke_tokens(db, user.id)
        db.commit()
        raise HTTPException(status_code=401, detail="Not authenticated")

    old.used_at = datetime.now(timezone.utc)
    response, _payload = _issue_session(db, user)
    return response


@router.post("/logout", response_model=MessageResponse)
def logout(
    data: LogoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.token_version += 1
    _revoke_tokens(db, current_user.id)
    db.commit()
    response = JSONResponse(content={"ok": True, "message": "Logged out"})
    _clear_cookies(response)
    return response


@router.get("/users", response_model=list[UserOut])
def users(current_user: User = Depends(get_current_user)):
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
    if "username" in updates and updates["username"] is not None:
        new_username = normalize_username(updates["username"])
        if new_username != current_user.username:
            existing = db.scalar(select(User).where(User.username == new_username))
            if existing and existing.id != current_user.id:
                raise HTTPException(status_code=400, detail="Username already taken")
            current_user.username = new_username
    if "email" in updates and updates["email"] is not None:
        new_email = normalize_email(updates["email"])
        if new_email != current_user.email:
            existing = db.scalar(select(User).where(User.email == new_email))
            if existing and existing.id != current_user.id:
                raise HTTPException(status_code=400, detail="Email already registered")
            current_user.email = new_email
            current_user.email_verified_at = None
            token = _issue_one_time_token(
                db, current_user, AuthToken.TOKEN_VERIFY, VERIFY_TOKEN_EXPIRE_DAYS * 24
            )
            auth_email.verification_email(new_email, token)
    if "name" in updates and updates["name"] is not None:
        current_user.name = updates["name"].strip()

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
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different")

    current_user.hashed_password = hash_password(data.new_password)
    current_user.token_version += 1
    _revoke_tokens(db, current_user.id)
    db.commit()
    response, _payload = _issue_session(db, current_user)
    return response


@router.post("/verify-email", response_model=MessageResponse)
def verify_email(data: EmailVerifyConfirm, db: Session = Depends(get_db)):
    user, _record = _consume_token(db, data.token, AuthToken.TOKEN_VERIFY)
    user.email_verified_at = datetime.now(timezone.utc)
    db.commit()
    return MessageResponse(message="Email verified.")


@router.post("/resend-verification", response_model=MessageResponse)
def resend_verification(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.email_verified_at is not None:
        return MessageResponse(message="Email already verified.")
    token = _issue_one_time_token(
        db, current_user, AuthToken.TOKEN_VERIFY, VERIFY_TOKEN_EXPIRE_DAYS * 24
    )
    auth_email.verification_email(current_user.email, token)
    return MessageResponse(message="Verification email sent.")


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(data: PasswordResetRequest, db: Session = Depends(get_db)):
    # Always the same response, whether or not the address exists.
    user = db.scalar(select(User).where(User.email == data.email))
    if user is not None:
        token = _issue_one_time_token(
            db, user, AuthToken.TOKEN_RESET, RESET_TOKEN_EXPIRE_HOURS
        )
        auth_email.password_reset_email(user.email, token)
    return MessageResponse(message="If the address exists, a reset link has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(data: PasswordResetConfirm, db: Session = Depends(get_db)):
    user, _record = _consume_token(db, data.token, AuthToken.TOKEN_RESET)
    user.hashed_password = hash_password(data.new_password)
    user.token_version += 1
    _revoke_tokens(db, user.id)
    db.commit()
    return MessageResponse(message="Password reset. Please log in again.")


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded")
    if len(contents) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="Profile picture is too large (max 5 MB)")

    try:
        with Image.open(io.BytesIO(contents)) as image:
            image.verify()
        with Image.open(io.BytesIO(contents)) as image:
            image = image.convert("RGB")
            image.thumbnail((MAX_AVATAR_DIMENSION, MAX_AVATAR_DIMENSION))
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=85, optimize=True)
            processed = output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=400, detail="Upload must be a valid image")

    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"user-{current_user.id}-{uuid.uuid4().hex}.jpg"
    path = AVATAR_DIR / filename
    path.write_bytes(processed)

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


@router.delete("/users/{user_id}", response_model=MessageResponse)
def users_delete(
    user_id: int,
    data: DeleteAccountRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id != current_user.id:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(data.password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Password is incorrect")
    if not delete_user(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return MessageResponse(message="Account deleted")
