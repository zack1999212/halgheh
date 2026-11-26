from __future__ import annotations

import hashlib
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

APP_ENV = (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "development").strip().lower()
IS_PRODUCTION = APP_ENV in {"production", "prod"}

_configured_secret = (os.getenv("SECRET_KEY") or "").strip()
if _configured_secret:
    SECRET_KEY = _configured_secret
elif IS_PRODUCTION:
    raise RuntimeError(
        "SECRET_KEY must be set to a non-empty value when running in production "
        "(APP_ENV=production). Refusing to start with the development fallback secret."
    )
else:
    SECRET_KEY = "dev-secret-change-me"

ALGORITHM = "HS256"
JWT_ISSUER = "halgheh"
JWT_AUDIENCE = "halgheh-web"

ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7
RESET_TOKEN_EXPIRE_HOURS = 2
VERIFY_TOKEN_EXPIRE_DAYS = 2

# bcrypt only uses the first 72 bytes; accepting more silently truncates.
PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_BYTES = 72
PASSWORD_MAX_LENGTH = 128

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def password_policy_error(password: str) -> str:
    """Return a human-readable policy violation, or an empty string."""
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Password must be at least {PASSWORD_MIN_LENGTH} characters"
    if len(password.encode("utf-8")) > PASSWORD_MAX_BYTES:
        return f"Password must be at most {PASSWORD_MAX_BYTES} bytes"
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "Password must contain both a letter and a number"
    return ""


def normalize_username(value: str) -> str:
    return value.strip().lower()


def normalize_email(value: str) -> str:
    return value.strip().lower()


def hash_token(raw: str) -> str:
    """Hash an opaque or JWT token before persisting it."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _jwt_payload(
    user_id: int,
    token_type: str,
    token_version: int,
    expires: datetime,
) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "sub": str(user_id),
        "type": token_type,
        "ver": token_version,
        "iat": now,
        "nbf": now,
        "exp": expires,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "jti": uuid.uuid4().hex,
    }


def create_access_token(user_id: int, token_version: int = 0) -> str:
    payload = _jwt_payload(
        user_id,
        "access",
        token_version,
        datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: int, token_version: int = 0) -> str:
    payload = _jwt_payload(
        user_id,
        "refresh",
        token_version,
        datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def decode_token(token: str, expected_type: str = "access") -> dict | None:
    """Decode and validate a JWT, returning its payload or None."""
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
        )
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    try:
        user_id = int(payload["sub"])
        token_version = int(payload["ver"])
    except (KeyError, TypeError, ValueError):
        return None
    return {"user_id": user_id, "token_version": token_version, "jti": payload.get("jti")}
