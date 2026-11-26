from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


ImproveAction = Literal["rewrite", "clarify", "grammar", "format"]


def _clean_text(value: str | None, *, max_length: int, field_name: str) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    if len(trimmed) > max_length:
        raise ValueError(f"{field_name} must be at most {max_length} characters")
    return trimmed


class DocumentAISummaryRequest(BaseModel):
    max_points: int = Field(default=6, ge=3, le=12)
    include_related: bool = False


class DocumentAIAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    include_related: bool = False

    @field_validator("question")
    @classmethod
    def _clean_question(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("question must not be empty")
        return trimmed


class DocumentAIImproveRequest(BaseModel):
    action: ImproveAction
    selected_text: str | None = Field(default=None, max_length=12000)
    instruction: str | None = Field(default=None, max_length=1000)
    include_related: bool = False

    @field_validator("selected_text")
    @classmethod
    def _clean_selected_text(cls, value: str | None) -> str | None:
        return _clean_text(value, max_length=12000, field_name="selected_text")

    @field_validator("instruction")
    @classmethod
    def _clean_instruction(cls, value: str | None) -> str | None:
        return _clean_text(value, max_length=1000, field_name="instruction")


class DocumentAIGenerateRequest(BaseModel):
    instruction: str = Field(..., min_length=1, max_length=2000)
    use_document_context: bool = True
    include_related: bool = False

    @field_validator("instruction")
    @classmethod
    def _clean_instruction(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("instruction must not be empty")
        return trimmed


class DocumentAIResponse(BaseModel):
    kind: Literal["summary", "answer", "improvement", "draft"]
    content: str
    provider: str
    provider_label: str
    model: str
    model_label: str
    truncated: bool = False
    context_included: bool = False
    related_documents_used: int = 0
    warning: str | None = None
