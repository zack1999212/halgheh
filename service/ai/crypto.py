"""Authenticated encryption for user-provided AI credentials.

Credentials are encrypted with Fernet (AES-128-CBC + HMAC-SHA256). The
encryption key is derived from a server-side secret and is never stored in the
database. Set ``AI_CREDENTIAL_ENCRYPTION_KEY`` in production; the application
falls back to ``SECRET_KEY`` (already required in production) when it is not
provided.
"""

from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken

_MARKER = "fernet:v1:"
_DEV_FALLBACK = "dev-ai-credentials-change-me"


def _server_secret() -> str:
    configured = (os.getenv("AI_CREDENTIAL_ENCRYPTION_KEY") or "").strip()
    if configured:
        return configured

    secret_key = (os.getenv("SECRET_KEY") or "").strip()
    if secret_key:
        return secret_key

    app_env = (
        os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "development"
    ).strip().lower()
    if app_env in {"production", "prod"}:
        raise RuntimeError(
            "AI_CREDENTIAL_ENCRYPTION_KEY (or SECRET_KEY) must be set in "
            "production to encrypt AI credentials."
        )
    return _DEV_FALLBACK


def _fernet() -> Fernet:
    digest = hashlib.sha256(_server_secret().encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    token = _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")
    return f"{_MARKER}{token}"


def decrypt_secret(ciphertext: str) -> str:
    if not ciphertext or not ciphertext.startswith(_MARKER):
        raise ValueError("Stored credential is not in a supported encrypted format")
    token = ciphertext[len(_MARKER) :]
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Stored credential could not be decrypted") from exc


def mask_secret(secret: str) -> str:
    """Only ever expose a masked representation of a stored key."""
    if not secret:
        return ""
    tail = secret[-4:] if len(secret) >= 4 else secret
    return f"\u2022\u2022\u2022\u2022{tail}"
