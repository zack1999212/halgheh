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


PricingClass = Literal["free", "paid", "unknown"]


class ModelOut(BaseModel):
    """A catalogue model: display metadata plus the exact upstream id."""

    id: int
    provider: str
    upstream_model_id: str
    label: str
    description: str | None = None
    context_window: int | None = None
    max_output_tokens: int | None = None
    supports_tools: bool | None = None
    supports_streaming: bool | None = None
    supports_vision: bool | None = None
    enabled: bool = True
    pricing_class: PricingClass = "unknown"
    input_price_per_mtok: float | None = None
    output_price_per_mtok: float | None = None
    is_custom: bool = False
    capabilities: ModelCapabilitiesOut
    known: bool = True


class ProviderOut(BaseModel):
    id: str
    label: str
    api_style: str
    default_base_url: str | None = None
    default_model: str
    supports_custom_base_url: bool = True
    supports_manual_model: bool = True
    supports_model_discovery: bool = False
    models: list[ModelOut]


def _clean_optional_int(value: int | None) -> int | None:
    if value is None:
        return None
    if value <= 0:
        raise ValueError("must be a positive integer")
    return value


class ModelCreate(BaseModel):
    upstream_model_id: str = Field(..., min_length=1, max_length=120)
    display_name: str = Field(..., min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    context_window: int | None = None
    max_output_tokens: int | None = None
    supports_tools: bool | None = None
    supports_streaming: bool | None = None
    supports_vision: bool | None = None
    enabled: bool = True
    pricing_class: PricingClass = "unknown"
    input_price_per_mtok: float | None = Field(default=None, ge=0)
    output_price_per_mtok: float | None = Field(default=None, ge=0)

    @field_validator("upstream_model_id")
    @classmethod
    def _clean_upstream(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("upstream_model_id must not be empty")
        return trimmed

    @field_validator("display_name")
    @classmethod
    def _clean_display(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("display_name must not be empty")
        return trimmed

    @field_validator("context_window", "max_output_tokens")
    @classmethod
    def _check_ints(cls, value: int | None) -> int | None:
        return _clean_optional_int(value)


class ModelUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    context_window: int | None = None
    max_output_tokens: int | None = None
    supports_tools: bool | None = None
    supports_streaming: bool | None = None
    supports_vision: bool | None = None
    enabled: bool | None = None
    pricing_class: PricingClass | None = None
    input_price_per_mtok: float | None = Field(default=None, ge=0)
    output_price_per_mtok: float | None = Field(default=None, ge=0)

    @field_validator("display_name")
    @classmethod
    def _clean_display(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("display_name must not be empty")
        return trimmed

    @field_validator("context_window", "max_output_tokens")
    @classmethod
    def _check_ints(cls, value: int | None) -> int | None:
        return _clean_optional_int(value)

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self


class ModelRefreshResponse(BaseModel):
    provider: str
    discovered: int
    added: int
    updated: int
    models: list[ModelOut]


class ModelToolCheckResponse(BaseModel):
    model: ModelOut
    supported: bool
    message: str


class CatalogResponse(BaseModel):
    providers: list[ProviderOut]


class AICredentialCreate(BaseModel):
    provider: str = Field(..., min_length=1, max_length=50)
    model: str = Field(..., min_length=1, max_length=120)
    api_key: str = Field(..., min_length=1, max_length=4096)
    base_url: str | None = Field(default=None, max_length=500)
    name: str | None = Field(default=None, max_length=100)
    extra_config: dict | None = None
    activate: bool = False

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
    model_label: str | None = None
    pricing_class: PricingClass = "unknown"
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
    model_id: int | None = None
    model_label: str | None = None
    pricing_class: PricingClass = "unknown"
    base_url: str | None
    has_credentials: bool
    credential_id: int | None
    model_known: bool
    capabilities: ModelCapabilitiesOut


class ProviderDiagnosticResponse(BaseModel):
    request_id: str
    user_id: int
    conversation_id: int | None
    provider: str
    model: str
    attempt: int
    status: str
    duration_ms: int | None
    http_status_code: int | None
    provider_error_code: str | None
    provider_error_message: str | None
    connected: bool | None
    headers_received: bool | None
    streaming_started: bool | None
    streaming_completed: bool | None
    connection_interrupted: bool | None
    retry_attempted: bool | None
    final_status: str | None
    created_at: datetime


class ProviderHealthResponse(BaseModel):
    provider: str
    state: str  # healthy, degraded, unavailable, recovering
    consecutive_failures: int
    failure_rate: float
    last_successful_request: str | None
    last_failure_at: str | None
    total_requests: int
    failed_requests: int


class RecentDiagnosticResponse(BaseModel):
    request_id: str
    provider: str
    model: str
    status: str
    duration_ms: int | None
    http_status_code: int | None
    provider_error_code: str | None
    provider_error_message: str | None
    connected: bool | None
    headers_received: bool | None
    streaming_started: bool | None
    streaming_completed: bool | None
    connection_interrupted: bool | None
    retry_attempted: bool | None
    final_status: str | None
    created_at: str


class ConnectionCheckResponse(BaseModel):
    provider: str
    reachable: bool
    authenticated: bool
    status: str  # healthy, no_credentials, unknown_provider, etc.
    message: str
    model: str | None = None
    retry_appropriate: bool | None = None
    user_intervention_required: bool | None = None


class RetrySuggestionResponse(BaseModel):
    provider: str
    model: str
    suggested_retry_delay: int | None  # seconds
    reason: str
    retry_appropriate: bool
    user_intervention_required: bool
    current_status: str