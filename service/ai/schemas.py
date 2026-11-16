from __future__ import annotations

from datetime import datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator, model_validator


def _clean_base_url(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    parsed = urlparse(trimmed)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("base_url must be a valid http(s) URL")
    return trimmed.rstrip("/")


class ModelCapabilitiesOut(BaseModel):
    chat_completion: bool | None = None
    tool_calling: bool | None = None
    structured_tool_arguments: bool | None = None


class ModelOut(BaseModel):
    id: str
    label: str
    known: bool = True
    capabilities: ModelCapabilitiesOut


class ProviderOut(BaseModel):
    id: str
    label: str
    api_style: str
    default_base_url: str | None = None
    default_model: str
    supports_custom_base_url: bool = True
    supports_manual_model: bool = True
    models: list[ModelOut]


class CatalogResponse(BaseModel):
    providers: list[ProviderOut]


class AICredentialCreate(BaseModel):
    provider: str = Field(..., min_length=1, max_length=50)
    model: str = Field(..., min_length=1, max_length=120)
    api_key: str = Field(..., min_length=1, max_length=4096)
    base_url: str | None = Field(default=None, max_length=500)
    name: str | None = Field(default=None, max_length=100)
    extra_config: dict | None = None
    activate: bool = True

    @field_validator("provider")
    @classmethod
    def _clean_provider(cls, value: str) -> str:
        trimmed = value.strip().lower()
        if not trimmed:
            raise ValueError("provider must not be empty")
        return trimmed

    @field_validator("model")
    @classmethod
    def _clean_model(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("model must not be empty")
        return trimmed

    @field_validator("api_key")
    @classmethod
    def _clean_api_key(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("api_key must not be empty")
        return trimmed

    @field_validator("base_url")
    @classmethod
    def _clean_url(cls, value: str | None) -> str | None:
        return _clean_base_url(value)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


class AICredentialUpdate(BaseModel):
    provider: str | None = Field(default=None, max_length=50)
    model: str | None = Field(default=None, max_length=120)
    api_key: str | None = Field(default=None, max_length=4096)
    base_url: str | None = Field(default=None, max_length=500)
    name: str | None = Field(default=None, max_length=100)
    extra_config: dict | None = None

    @field_validator("provider")
    @classmethod
    def _clean_provider(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().lower()

    @field_validator("model")
    @classmethod
    def _clean_model(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("model must not be empty")
        return trimmed

    @field_validator("api_key")
    @classmethod
    def _clean_api_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        # A blank value means "keep the existing key".
        return trimmed or None

    @field_validator("base_url")
    @classmethod
    def _clean_url(cls, value: str | None) -> str | None:
        return _clean_base_url(value)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self


class AICredentialResponse(BaseModel):
    id: int
    provider: str
    provider_label: str
    model: str
    base_url: str | None
    name: str | None
    has_credentials: bool
    api_key_masked: str
    is_active: bool
    model_known: bool
    capabilities: ModelCapabilitiesOut
    created_at: datetime
    updated_at: datetime


class EffectiveConfigResponse(BaseModel):
    source: Literal["personal", "application"]
    provider: str
    provider_label: str
    model: str
    base_url: str | None
    has_credentials: bool
    credential_id: int | None
    model_known: bool
    capabilities: ModelCapabilitiesOut
