from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

# Kept in sync with the ck_document_links_link_type database constraint.
LinkType = Literal["related", "reference", "depends_on"]


class DocumentLinkCreate(BaseModel):
    target_document_id: int
    link_type: LinkType


class DocumentLinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_document_id: int
    target_document_id: int
    link_type: str
    created_at: datetime


class DocumentLinksResponse(BaseModel):
    outgoing: list[DocumentLinkResponse]
    incoming: list[DocumentLinkResponse]
