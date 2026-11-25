"""Minimal SMTP email delivery for verification and password reset.

In development without SMTP_* settings the message is logged instead of sent,
so the flows can be exercised locally. Production requires SMTP to be set.
"""

from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

from .security import IS_PRODUCTION

logger = logging.getLogger("halgheh.auth.email")

SMTP_HOST = (os.getenv("SMTP_HOST") or "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT") or "587")
SMTP_USER = (os.getenv("SMTP_USER") or "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD") or ""
SMTP_FROM = (os.getenv("SMTP_FROM") or "Halgheh <no-reply@halgheh.local>").strip()
APP_URL = (os.getenv("PUBLIC_APP_URL") or "http://localhost:5173").rstrip("/")


def send_email(to: str, subject: str, body: str) -> bool:
    if not SMTP_HOST:
        if IS_PRODUCTION:
            raise RuntimeError("SMTP_HOST must be configured in production")
        logger.info("DEV EMAIL to %s — %s\n%s", to, subject, body)
        return False

    message = EmailMessage()
    message["From"] = SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as client:
        client.ehlo()
        client.starttls()
        if SMTP_USER:
            client.login(SMTP_USER, SMTP_PASSWORD)
        client.send_message(message)
    return True


def verification_email(to: str, token: str) -> None:
    send_email(
        to,
        "Verify your Halgheh email",
        f"Verify your email address: {APP_URL}/verify-email?token={token}\n\n"
        "This link expires in 2 days.",
    )


def password_reset_email(to: str, token: str) -> None:
    send_email(
        to,
        "Reset your Halgheh password",
        f"Reset your password: {APP_URL}/reset-password?token={token}\n\n"
        "This link expires in 2 hours. If you did not request it, ignore this email.",
    )
