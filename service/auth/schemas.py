from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from .security import normalize_email, normalize_username, password_policy_error


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(..., min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(..., min_length=10, max_length=128)
    name: str = Field(default="", max_length=128)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        normalized = normalize_username(value)
        if len(normalized) < 3:
            raise ValueError("Username must be at least 3 characters")
        if not all(char.isalnum() or char in "._-" for char in normalized):
            raise ValueError("Username may contain only letters, numbers, '.', '_' and '-'")
        return normalized

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        error = password_policy_error(value)
        if error:
            raise ValueError(error)
        return value

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return value.strip()


class UserLogin(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return normalize_username(value)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    email_verified_at: datetime | None = None
    name: str
    avatar_url: str | None = None
    created_at: datetime


class UserProfileUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=64)
    email: EmailStr | None = None
    name: str | None = Field(default=None, max_length=128)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = normalize_username(value)
        if len(normalized) < 3:
            raise ValueError("Username must be at least 3 characters")
        return normalized

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value) if value else None

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("No profile changes provided")
        return self


class PasswordChange(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=10, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        error = password_policy_error(value)
        if error:
            raise ValueError(error)
        return value


class PasswordResetRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)


class PasswordResetConfirm(BaseModel):
    token: str = Field(..., min_length=1, max_length=256)
    new_password: str = Field(..., min_length=10, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        error = password_policy_error(value)
        if error:
            raise ValueError(error)
        return value


class EmailVerifyConfirm(BaseModel):
    token: str = Field(..., min_length=1, max_length=256)


class LogoutRequest(BaseModel):
    everywhere: bool = False


class DeleteAccountRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=128)


class SessionResponse(BaseModel):
    csrf_token: str
    user: UserOut
    access_token_expires_in: int = Field(default=30 * 60)
    refresh_token_expires_in: int = Field(default=7 * 24 * 60 * 60)


class MessageResponse(BaseModel):
    ok: bool = True
    message: str = ""
    variant: Literal["success", "info"] = "success"
