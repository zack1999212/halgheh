from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from ...core.database import Base


class ProviderModel(Base):
    """A model published by an AI provider.

    ``upstream_model_id`` is the exact identifier Halgheh sends to the provider
    API; ``display_name`` is presentation only. This table is the single source
    of truth for model identifiers and capabilities, so no model identifier is
    hardcoded inside a provider adapter.

    Capability flags are deliberately nullable: ``None`` means "not verified
    yet" and is treated differently from ``False`` ("known unsupported").
    """

    __tablename__ = "provider_models"
    __table_args__ = (
        UniqueConstraint(
            "provider_id",
            "upstream_model_id",
            name="uq_provider_models_upstream",
        ),
        Index("ix_provider_models_provider_enabled", "provider_id", "enabled"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    provider_id: Mapped[str] = mapped_column(String(50), nullable=False)
    upstream_model_id: Mapped[str] = mapped_column(String(120), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_window: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    supports_tools: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    supports_streaming: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    supports_vision: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    # "free" | "paid" | "unknown"
    pricing_class: Mapped[str] = mapped_column(
        String(10), nullable=False, default="unknown", server_default="unknown"
    )
    # USD per 1M tokens, when the provider publishes them.
    input_price_per_mtok: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 4), nullable=True
    )
    output_price_per_mtok: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 4), nullable=True
    )
    # Models entered by a user through the settings UI (removable).
    is_custom: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
