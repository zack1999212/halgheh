"""Centralized provider error classification system.

Distinguishes between permanent failures (no retry) and temporary failures
(automatic retry appropriate). Each error has a machine-readable category,
human-readable explanation, and retry/intervention guidance.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto


class ErrorCategory(Enum):
    """Machine-readable error categories for provider failures."""

    # Permanent failures - never retry automatically
    AUTHENTICATION = auto()       # Invalid API key, wrong credentials
    INSUFFICIENT_BALANCE = auto() # Account has run out of credit/quota
    INVALID_REQUEST = auto()      # Bad request, unsupported model/operation
    UNSUPPORTED_MODEL = auto()    # Model doesn't support required capabilities
    MISSING_PERMISSIONS = auto()  # Agent lacks permission for tool

    # Temporary failures - retry appropriate
    CONNECTION_FAILURE = auto()   # Network error, connection reset
    DNS_FAILURE = auto()          # DNS resolution failure
    TIMEOUT = auto()              # Request timeout (connection or read)
    RATE_LIMIT = auto()           # HTTP 429, too many requests
    OVERLOAD = auto()             # HTTP 502/503, provider overloaded
    SERVER_ERROR = auto()         # HTTP 500, 504, internal server error
    STREAMING_INTERRUPTED = auto() # Streaming connection broken
    UNKNOWN_PROVIDER_ERROR = auto() # Provider returned an unexpected error


@dataclass
class ClassifiedError:
    """Result of classifying a provider error.

    Each failure has a machine-readable category, human-readable explanation,
    and guidance on whether retrying is appropriate and whether user intervention
    is required.
    """

    category: ErrorCategory
    human_message: str
    retry_appropriate: bool
    user_intervention_required: bool
    # Provider-specific error code preserved when available
    provider_error_code: str | None = None
    # Suggested retry delay in seconds (for transient errors)
    suggested_retry_delay: int | None = None
    # Sanitized provider message that led to this classification. It is stored
    # only in diagnostics and is never returned to the client.
    provider_error_message: str | None = None


# --- Classification rules ---

# Mapping of HTTP status codes to error categories
HTTP_STATUS_MAP = {
    401: ErrorCategory.AUTHENTICATION,
    403: ErrorCategory.AUTHENTICATION,
    429: ErrorCategory.RATE_LIMIT,
    500: ErrorCategory.SERVER_ERROR,
    502: ErrorCategory.OVERLOAD,
    503: ErrorCategory.OVERLOAD,
    504: ErrorCategory.SERVER_ERROR,
}

# Mapping of provider error codes to categories
PROVIDER_ERROR_CODE_MAP = {
    # Z.ai specific codes
    "insufficient_balance": ErrorCategory.INSUFFICIENT_BALANCE,
    "1113": ErrorCategory.INSUFFICIENT_BALANCE,
    "rate_limit": ErrorCategory.RATE_LIMIT,
    "model_not_found": ErrorCategory.INVALID_REQUEST,
    "invalid_model": ErrorCategory.INVALID_REQUEST,
    "invalid_request": ErrorCategory.INVALID_REQUEST,
    "service_unavailable": ErrorCategory.OVERLOAD,
    "temporary_overload": ErrorCategory.OVERLOAD,
}

# Mapping of provider error messages (substrings) to categories
PROVIDER_ERROR_MESSAGE_MAP = {
    "rate limit": ErrorCategory.RATE_LIMIT,
    "insufficient balance": ErrorCategory.INSUFFICIENT_BALANCE,
    "invalid api key": ErrorCategory.AUTHENTICATION,
    "invalid key": ErrorCategory.AUTHENTICATION,
    "authentication failed": ErrorCategory.AUTHENTICATION,
    "token expired": ErrorCategory.AUTHENTICATION,
    "service unavailable": ErrorCategory.OVERLOAD,
    "temporarily unavailable": ErrorCategory.OVERLOAD,
    "overloaded": ErrorCategory.OVERLOAD,
    "connection timed out": ErrorCategory.TIMEOUT,
    "read timeout": ErrorCategory.TIMEOUT,
    "could not connect": ErrorCategory.CONNECTION_FAILURE,
    "connection reset": ErrorCategory.CONNECTION_FAILURE,
    "dns": ErrorCategory.DNS_FAILURE,
    "stream": ErrorCategory.STREAMING_INTERRUPTED,
}


def classify_error(
    *,
    http_status: int | None = None,
    provider_error_code: str | None = None,
    provider_error_message: str | None = None,
) -> ClassifiedError:
    """Classify a provider error into a category with guidance.

    The classification logic follows these priorities (in order):
    1. HTTP status code mapping (most specific)
    2. Provider error code mapping
    3. Provider error message substring matching
    4. Default to UNKNOWN_PROVIDER_ERROR

    Returns a ClassifiedError with category, human_message, retry_appropriate,
    and user_intervention_required flags.
    """

    # Billing signals take priority: some providers report an empty account with
    # a generic status code (Z.ai returns HTTP 429 / code 1113 for insufficient
    # balance), which would otherwise be misreported as rate limiting.
    billing_codes = {"1113", "insufficient_balance"}
    message_lower = (provider_error_message or "").lower()
    if (provider_error_code or "").lower() in billing_codes or (
        "insufficient balance" in message_lower
        or "no resource package" in message_lower
    ):
        return _build_guidance(
            ErrorCategory.INSUFFICIENT_BALANCE, provider_error_message
        )

    # Step 1: HTTP status code mapping
    if http_status is not None and http_status in HTTP_STATUS_MAP:
        category = HTTP_STATUS_MAP[http_status]
    # Step 2: Provider error code mapping
    elif provider_error_code and provider_error_code.lower() in PROVIDER_ERROR_CODE_MAP:
        category = PROVIDER_ERROR_CODE_MAP[provider_error_code.lower()]
    # Step 3: Provider error message substring matching
    elif provider_error_message:
        message_lower = provider_error_message.lower()
        for substr, cat in PROVIDER_ERROR_MESSAGE_MAP.items():
            if substr in message_lower:
                category = cat
                break
        else:
            category = ErrorCategory.UNKNOWN_PROVIDER_ERROR
    # Step 4: Default
    else:
        category = ErrorCategory.UNKNOWN_PROVIDER_ERROR

    # Build human-readable message and retry/intervention guidance
    return _build_guidance(category, provider_error_message)


def _build_guidance(
    category: ErrorCategory,
    provider_error_message: str | None,
) -> ClassifiedError:
    """Build human-readable guidance for an error category."""

    if category == ErrorCategory.AUTHENTICATION:
        return ClassifiedError(
            category=ErrorCategory.AUTHENTICATION,
            human_message="API key is invalid or authentication failed. Check your AI provider settings.",
            retry_appropriate=False,
            user_intervention_required=True,
            provider_error_message=provider_error_message,
        )

    if category == ErrorCategory.INSUFFICIENT_BALANCE:
        return ClassifiedError(
            category=ErrorCategory.INSUFFICIENT_BALANCE,
            human_message="Your AI provider account has insufficient balance or quota. Add credit or check your plan.",
            retry_appropriate=False,
            user_intervention_required=True,
            provider_error_message=provider_error_message,
        )

    if category == ErrorCategory.INVALID_REQUEST:
        return ClassifiedError(
            category=ErrorCategory.INVALID_REQUEST,
            human_message="The AI provider rejected the request. The selected model may not support the required operations.",
            retry_appropriate=False,
            user_intervention_required=False,
            provider_error_message=provider_error_message,
        )

    if category == ErrorCategory.UNSUPPORTED_MODEL:
        return ClassifiedError(
            category=ErrorCategory.UNSUPPORTED_MODEL,
            human_message="The selected model does not support the required operations (e.g., tool calling). Choose a compatible model.",
            retry_appropriate=False,
            user_intervention_required=False,
            provider_error_message=provider_error_message,
        )

    if category == ErrorCategory.MISSING_PERMISSIONS:
        return ClassifiedError(
            category=ErrorCategory.MISSING_PERMISSIONS,
            human_message="The AI agent does not have permission to perform this operation.",
            retry_appropriate=False,
            user_intervention_required=False,
            provider_error_message=provider_error_message,
        )

    if category == ErrorCategory.RATE_LIMIT:
        return ClassifiedError(
            category=ErrorCategory.RATE_LIMIT,
            human_message="The AI provider is rate limiting requests. Please try again shortly.",
            retry_appropriate=True,
            user_intervention_required=False,
            provider_error_message=provider_error_message,
            suggested_retry_delay=60,
        )

    if category == ErrorCategory.OVERLOAD:
        return ClassifiedError(
            category=ErrorCategory.OVERLOAD,
            human_message="The AI provider is temporarily overloaded. Retrying shortly is likely to succeed.",
            retry_appropriate=True,
            user_intervention_required=False,
            provider_error_message=provider_error_message,
            suggested_retry_delay=30,
        )

    if category == ErrorCategory.TIMEOUT:
        return ClassifiedError(
            category=ErrorCategory.TIMEOUT,
            human_message="The AI provider request timed out. Retrying may succeed.",
            retry_appropriate=True,
            user_intervention_required=False,
            provider_error_message=provider_error_message,
            suggested_retry_delay=45,
        )

    if category == ErrorCategory.CONNECTION_FAILURE:
        return ClassifiedError(
            category=ErrorCategory.CONNECTION_FAILURE,
            human_message="Could not connect to the AI provider. Check your network and try again.",
            retry_appropriate=True,
            user_intervention_required=False,
            provider_error_message=provider_error_message,
            suggested_retry_delay=30,
        )

    if category == ErrorCategory.DNS_FAILURE:
        return ClassifiedError(
            category=ErrorCategory.DNS_FAILURE,
            human_message="DNS resolution failed for the AI provider endpoint. This is typically a transient network issue.",
            retry_appropriate=True,
            user_intervention_required=False,
            provider_error_message=provider_error_message,
            suggested_retry_delay=15,
        )

    if category == ErrorCategory.STREAMING_INTERRUPTED:
        return ClassifiedError(
            category=ErrorCategory.STREAMING_INTERRUPTED,
            human_message="The AI provider's response stream was interrupted. Retrying may restore the connection.",
            retry_appropriate=True,
            user_intervention_required=False,
            provider_error_message=provider_error_message,
            suggested_retry_delay=30,
        )

    if category == ErrorCategory.UNKNOWN_PROVIDER_ERROR:
        return ClassifiedError(
            category=ErrorCategory.UNKNOWN_PROVIDER_ERROR,
            human_message="The AI provider returned an error. Please check your connection and try again.",
            retry_appropriate=True,
            user_intervention_required=False,
            provider_error_message=provider_error_message,
            suggested_retry_delay=30,
        )

    # Should never reach here
    return ClassifiedError(
        category=ErrorCategory.UNKNOWN_PROVIDER_ERROR,
        human_message="An unknown error occurred.",
        retry_appropriate=False,
        user_intervention_required=False,
        provider_error_message=provider_error_message,
    )