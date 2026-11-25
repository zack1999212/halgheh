from __future__ import annotations

import hmac

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..core.database import get_db
from .models import User
from .security import decode_token

ACCESS_COOKIE = "halgheh_access"
REFRESH_COOKIE = "halgheh_refresh"
CSRF_COOKIE = "halgheh_csrf"
CSRF_HEADER = "x-csrf-token"
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )


def verify_csrf(request: Request) -> None:
    """Double-submit cookie check for requests authenticated by cookies."""
    cookie = request.cookies.get(CSRF_COOKIE)
    header = request.headers.get(CSRF_HEADER)
    if not cookie or not header or not hmac.compare_digest(cookie, header):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF check failed")


def get_raw_access_token(request: Request) -> tuple[str | None, bool]:
    """Return (token, from_cookie). Cookies take precedence over Bearer."""
    token = request.cookies.get(ACCESS_COOKIE)
    if token:
        return token, True
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header.split(" ", 1)[1].strip(), False
    return None, False


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    raw, from_cookie = get_raw_access_token(request)
    if not raw:
        raise _unauthorized()

    payload = decode_token(raw, "access")
    if payload is None:
        raise _unauthorized()

    user = db.get(User, payload["user_id"])
    if user is None or payload["token_version"] != user.token_version:
        raise _unauthorized()

    if from_cookie and request.method in UNSAFE_METHODS:
        verify_csrf(request)

    return user
