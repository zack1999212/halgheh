from datetime import datetime

from pydantic import BaseModel, ConfigDict

from .common import Page


class DocumentVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    version_number: int
    title: str
    content: str
    created_by: int | None
    created_at: datetime


class DocumentVersionListResponse(Page):
    items: list[DocumentVersionResponse]
