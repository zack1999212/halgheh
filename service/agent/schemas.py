from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator


class AgentResponse(BaseModel):
    id: str
    page: str
    title: str
    description: str
    enabled: bool
    permissions: list[str]
    tool_count: int


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    # IANA timezone used to interpret relative dates and default tool times.
    timezone: str | None = Field(default=None, max_length=64)
    # Optional model selection for the new conversation. Omitted means "inherit
    # the user preference, then the application default".
    provider: str | None = Field(default=None, max_length=50)
    model: str | None = Field(default=None, max_length=120)

    @field_validator("title")
    @classmethod
    def _clean_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        try:
            ZoneInfo(trimmed)
        except (ZoneInfoNotFoundError, ValueError, KeyError):
            raise ValueError("timezone must be a valid IANA timezone identifier")
        return trimmed


class ConversationUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)

    @field_validator("title")
    @classmethod
    def _clean_title(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("title must not be empty")
        return trimmed


class ConversationModelUpdate(BaseModel):
    """Pin a conversation to a provider/model, or clear it with nulls."""

    provider: str | None = Field(default=None, max_length=50)
    model: str | None = Field(default=None, max_length=120)


class ConversationResponse(BaseModel):
    id: int
    agent_id: str
    title: str
    timezone: str | None = None
    provider: str | None = None
    model: str | None = None
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str | None
    tool_calls: list[dict[str, Any]] | None = None
    tool_call_id: str | None = None
    tool_name: str | None = None
    tool_arguments: dict[str, Any] | None = None
    tool_result: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime


class PendingActionResponse(BaseModel):
    id: int
    conversation_id: int
    agent_id: str
    tool_name: str
    summary: str | None
    tool_arguments: dict[str, Any]
    status: str
    result: dict[str, Any] | None = None
    error: str | None
    created_at: datetime
    expires_at: datetime
    resolved_at: datetime | None


class ConversationDetailResponse(BaseModel):
    conversation: ConversationResponse
    messages: list[MessageResponse]
    pending_actions: list[PendingActionResponse]


class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=8000)

    @field_validator("content")
    @classmethod
    def _clean_content(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("content must not be empty")
        return trimmed


class SendMessageResponse(BaseModel):
    messages: list[MessageResponse]
    pending_actions: list[PendingActionResponse]
