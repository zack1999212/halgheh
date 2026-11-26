from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


DiscussionType = Literal["announcement", "discussion"]


class DiscussionAuthor(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str | None = None
    name: str | None = None
    avatar_url: str | None = None


class ReactionSummary(BaseModel):
    emoji: str
    count: int
    reacted_by_me: bool = False


class DiscussionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: DiscussionType
    title: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1, max_length=10000)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Title must not be empty")
        return trimmed

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Content must not be empty")
        return trimmed


class DiscussionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None, min_length=1, max_length=10000)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Title must not be empty")
        return trimmed

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Content must not be empty")
        return trimmed

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("Title must not be null")
        if "content" in self.model_fields_set and self.content is None:
            raise ValueError("Content must not be null")
        return self


class DiscussionPinUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_pinned: bool


class ReplyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(..., min_length=1, max_length=10000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Content must not be empty")
        return trimmed


class ReplyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(..., min_length=1, max_length=10000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Content must not be empty")
        return trimmed


class ReactionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    emoji: str = Field(..., min_length=1, max_length=32)

    @field_validator("emoji")
    @classmethod
    def validate_emoji(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Emoji must not be empty")
        return trimmed


class DiscussionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    author_id: int
    author: DiscussionAuthor | None = None
    type: DiscussionType
    title: str
    content: str
    is_pinned: bool
    reply_count: int = 0
    reactions: list[ReactionSummary] = Field(default_factory=list)
    viewer_reactions: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class DiscussionListResponse(BaseModel):
    items: list[DiscussionResponse]
    total: int
    limit: int
    offset: int


class ReplyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    discussion_id: int
    author_id: int | None = None
    author: DiscussionAuthor | None = None
    content: str | None = None
    is_deleted: bool = False
    reactions: list[ReactionSummary] = Field(default_factory=list)
    viewer_reactions: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class ReplyListResponse(BaseModel):
    items: list[ReplyResponse]
    total: int
    limit: int
    offset: int


class ReactionMutationResponse(BaseModel):
    target_type: Literal["discussion", "reply"]
    target_id: int
    reactions: list[ReactionSummary] = Field(default_factory=list)
    viewer_reactions: list[str] = Field(default_factory=list)
