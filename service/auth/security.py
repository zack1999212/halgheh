from datetime import datetime, timedelta, timezone

import os

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
TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (jwt.PyJWTError, ValueError):
        return None
